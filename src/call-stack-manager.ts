import * as debugFile from './debug-file';
import * as mapFile from './map-file';
import {ViceGrip} from './vice-grip';
import * as bin from './binary-dto';
import * as _ from 'lodash';
import * as disassembly from './disassembly';

export class CallStackManager {
    private _cpuStackBottom: number = 0x1ff;
    private _cpuStackTop: number = 0x1ff;

    private _stackFrameStarts : { [index: string]: debugFile.Scope } = {};
    private _stackFrameEnds : { [index: string]: debugFile.Scope } = {};

    private _stackFrameBreakIndexes : number[] = [];

    private _stackFrames : {line: debugFile.SourceLine, scope: debugFile.Scope}[] = [];
    private _vice: ViceGrip;
    private _mapFile: mapFile.MapRef[];
    private _dbgFile: debugFile.Dbgfile;

    constructor(vice: ViceGrip, mpFile: mapFile.MapRef[], dbgFile: debugFile.Dbgfile) {
        this._vice = vice;
        this._dbgFile = dbgFile;
        this._mapFile = mpFile;
    }

    private async _getStackFramesForScope(searchScope: debugFile.Scope, parentScope: debugFile.Scope, codeSegMem: Buffer) : Promise<{
    starts: { address: number, scope: debugFile.Scope }[],
    ends: { address: number, scope: debugFile.Scope }[]
    } | null> {
        const scopeEndFrames : { address: number, scope: debugFile.Scope }[] = [];

        if(!parentScope.name.startsWith("_")) {
            return null;
        }

        const span = searchScope.codeSpan;
        if(!span) {
            return null;
        }

        const begin = span.absoluteAddress;
        const end = begin + span.size;

        let finish = false;

        const spanMem = codeSegMem.slice(span.start, span.start + span.size);

        const res = await disassembly.findStackExitsForScope(this._mapFile, searchScope, parentScope, spanMem, this._dbgFile.scopes, this._dbgFile.labs, this._dbgFile.codeSeg);
        scopeEndFrames.push(...res.addresses.map(x => ({
            scope: parentScope,
            address: x, 
        })));
        for(const descendant of res.descendants) {
            const desRes = await this._getStackFramesForScope(descendant, parentScope, codeSegMem);
            if(!desRes) {
                continue;
            }

            scopeEndFrames.push(...desRes.ends);
        }

        let start : debugFile.SourceLine = this._dbgFile.lines[0];
        for(const line of this._dbgFile.lines) {
            if(!line.span) {
                continue;
            }

            if(line.span.absoluteAddress < begin) {
                break;
            }

            start = line;
        }

        if(!scopeEndFrames.length && parentScope.codeSpan) {
            const codeSpan = parentScope.codeSpan;
            scopeEndFrames.push({
                scope: parentScope,
                address: this._dbgFile.spans.find(x => codeSpan.absoluteAddress <= x.absoluteAddress && x.absoluteAddress < codeSpan.absoluteAddress + codeSpan.size)!.absoluteAddress,
            });
        }

        return {
            starts: [{
                scope: parentScope,
                address: start.span!.absoluteAddress,
            }],
            ends: _.uniqBy(scopeEndFrames, x => x.address),
        }
    }

    public async prettyStack(currentAddress: number, currentFile: string, currentLine: number, startFrame: number, endFrame: number): Promise<any> {
        const frames = new Array<any>();
        let i = startFrame;

        frames.push({
            index: i,
            name: '0x' + currentAddress.toString(16),
            file: currentFile,
            line: currentLine
        });
        i++;

        for(const frame of [...this._stackFrames].reverse()) {
            frames.push({
                index: i,
                name: frame.scope.name.replace(/^_/g, ''),
                file: frame.line.file!.name,
                line: frame.line.num,
            });
            i++;
        }

        return {
            frames: frames,
            count: frames.length,
        };
    }

    public setCpuStackTop(value: number) {
        this._cpuStackTop = value;
    }

    public async getExitAddresses() : Promise<number[]> {
        const codeSeg = this._dbgFile.codeSeg;
        if(!this._dbgFile.mainScope || !codeSeg) {
            return [];
        }

        const codeSegMem = await this._vice.getMemory(codeSeg.start, codeSeg.size);
        const mainFrames = await this._getStackFramesForScope(this._dbgFile.mainScope, this._dbgFile.mainScope, codeSegMem);
        if(!mainFrames) {
            return [];
        }
        const exitAddresses = mainFrames.ends.map(x => x.address);

        return exitAddresses;
    }

    public async reset(currentAddress: number, currentLine: debugFile.SourceLine) : Promise<void> {
        this._stackFrameStarts = {};
        this._stackFrameEnds = {};
        this._stackFrameBreakIndexes = [];
        this._stackFrames = [];

        const startFrames : { address: number, scope: debugFile.Scope }[] = [];
        const endFrames : { address: number, scope: debugFile.Scope }[] = [];

        const codeSeg = this._dbgFile.codeSeg;
        if(!codeSeg) {
            return;
        }

        const codeSegMem = await this._vice.getMemory(codeSeg.start, codeSeg.size);
        const reses = await Promise.all(this._dbgFile.scopes.map(x => this._getStackFramesForScope(x, x, codeSegMem)))
        for(const res of reses) {
            if(!res) {
                continue;
            }

            startFrames.push(...res.starts);
            endFrames.push(...res.ends);
        }

        const [resStarts, resEnds, brks] = await Promise.all([
            (async() => {
                const traceStarts : bin.CheckpointSetCommand[] =
                    startFrames.map(frame => ({
                        type: bin.CommandType.checkpointSet,
                        operation: bin.CpuOperation.exec,
                        startAddress: frame.address,
                        endAddress: frame.address,
                        temporary: false,
                        stop: false,
                        enabled: true,
                    }));
                return await this._vice.multiExecBinary(traceStarts) as bin.CheckpointInfoResponse[];
            })(),
            (async() => {
                const traceEnds : bin.CheckpointSetCommand[] =
                    endFrames.map(frame => ({
                        type: bin.CommandType.checkpointSet,
                        operation: bin.CpuOperation.exec,
                        startAddress: frame.address,
                        endAddress: frame.address,
                        temporary: false,
                        stop: false,
                        enabled: true,
                    }));

                return await this._vice.multiExecBinary(traceEnds) as bin.CheckpointInfoResponse[];
            })(),
            (async() => {
                const breakStarts : bin.CheckpointSetCommand[] =
                    startFrames.map(frame => ({
                        type: bin.CommandType.checkpointSet,
                        operation: bin.CpuOperation.exec,
                        startAddress: frame.address,
                        endAddress: frame.address,
                        temporary: false,
                        stop: true,
                        enabled: false,
                    }));

                return await this._vice.multiExecBinary(breakStarts) as bin.CheckpointInfoResponse[];
            })()
        ]);

        for(const brk of brks) {
            this._stackFrameBreakIndexes.push(brk.id);
        }

        for(const start of resStarts) {
            this._stackFrameStarts[start.id] = startFrames.find(x => x.address == start.startAddress)!.scope;
        }

        for(const end of resEnds) {
            const endFrame = endFrames.find(x => x.address == end.startAddress)!;
            this._stackFrameEnds[end.id] = endFrame.scope;
            _.remove(endFrames, x => x == endFrame);
        }

        await this._stackFrameBreakToggle(false);

        const current = resStarts.find(x => x.startAddress == currentAddress);
        if(!current) {
            return;
        }

        this.addFrame(current, currentLine);
    }

    public addFrame(brk: bin.CheckpointInfoResponse, line: debugFile.SourceLine) {
        if(brk.stop) {
            return;
        }

        if(brk.operation != bin.CpuOperation.exec) {
            return;
        }

        let scope: debugFile.Scope;
        if(scope = this._stackFrameStarts[brk.id]) {
            this._stackFrames.push({line: line, scope: scope });
        }
        else if(scope = this._stackFrameEnds[brk.id]) {
            const idx = [...this._stackFrames].reverse().findIndex(x => x.scope.id == scope.id);
            if(idx > -1) {
                this._stackFrames.splice(this._stackFrames.length - 1 - idx, 1);
            }
        }
    }

    private async _stackFrameBreakToggle(enabled: boolean) {
        const cmd : bin.CheckpointToggleCommand[] =
            this._stackFrameBreakIndexes
            .map(id => ({
                type: bin.CommandType.checkpointToggle,
                enabled,
                id,
            }));

        await this._vice.multiExecBinary(cmd);
    }
    
    public async withFrameBreaksEnabled<T>(func: () => Promise<T>) : Promise<T> {
        await this._stackFrameBreakToggle(true);

        const res = await func();

        await this._stackFrameBreakToggle(false);

        return res;
    }
    
    public async returnToLastStackFrame(vice: ViceGrip) : Promise<boolean> {
        const lastFrame = this._stackFrames[this._stackFrames.length - 2];
        if(!lastFrame) {
            return false;
        }

        const begin = lastFrame.scope.codeSpan!.absoluteAddress;
        const end = lastFrame.scope.codeSpan!.absoluteAddress + lastFrame.scope.codeSpan!.size - 1;

        await vice.withAllBreaksDisabled(async() => {
            const brk = await vice.execBinary<bin.CheckpointSetCommand, bin.CheckpointInfoResponse>({
                type: bin.CommandType.checkpointSet,
                startAddress: begin,
                endAddress: end,
                enabled: true,
                temporary: true,
                stop: true,
                operation: bin.CpuOperation.exec,
            });

            await vice.waitForStop(brk.startAddress, brk.endAddress);

        });

        return true;
    }
}