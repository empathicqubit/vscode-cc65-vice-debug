import * as path from 'path';

export interface Version {
	major: number;
	minor: number;
}

export interface Scope {
	id: number;
	name: string;
	csyms: CSym[];
	size: number;
	spanId: number;
	span: DebugSpan | null;
}

export enum sc {
	auto = 0,
	ext = 1,
}

export interface CSym {
	id: number;
	name: string;
	offs: number;
	scopeId: number;
	scope: Scope | null;
	sym: Sym | null;
	symId : number;
	sc: sc;
}

export interface Sym {
	id: number;
	name: string;
	addrsize: Addrsize;
	seg: CodeSeg | null;
	segId: number;
	size: number;
	def: string;
	ref: number;
	val: number;
	type: string;
}

export enum Addrsize {
	relative = 0,
	absolute = 1
}

export enum Segtype {
	ro = 0,
	rw = 1,
}

export interface CodeSeg {
	name: string;
	oname: string;
	id: number;
	start: number;
	size: number;
	ooffs: number;
	addrsize: Addrsize;
	type: Segtype;
}

export interface DebugSpan {
	seg: CodeSeg | null;
	id: number;
	segId: number;
	start: number;
	absoluteAddress: number;
	size: number;
	type: number;
	lines: SourceLine[];
}

export interface SourceLine {
	file: SourceFile | null;
	span: DebugSpan | null;
	id: number;
	num: number;
	fileId: number;
	spanId: number;
	type: number;
	count: number;
}

export interface SourceFile {
	mtime: Date;
	mod: string;
	name: string;
	id: number;
	size: number;
	lines: SourceLine[];
}

export interface Dbgfile {
	csyms: CSym[];
	scopes: Scope[];
	files: SourceFile[];
	lines: SourceLine[];
	segs: CodeSeg[];
	syms: Sym[];
	labs: Sym[];
	spans: DebugSpan[];
	version: Version;
}

export function parse(text: string, filename : string) : Dbgfile {
	const dbgFile : Dbgfile = {
		scopes: [],
		csyms: [],
		syms: [],
		labs: [],
		segs: [],
		spans: [],
		lines: [],
		files: [],
		version: {
			major: -1,
			minor: -1
		},
	};

	const props = "([a-zA-Z]+)\\s*=\\s*\"?([^\n\r,\"]+)\"?\\s*,?";
	let rex = new RegExp("^\\s*(csym|file|info|lib|line|mod|scope|seg|span|sym|type|version)\\s+((" + props + ")+)$", "gim");

	let match = rex.exec(text);

	do {
		if(!match || match.length < 3) {
			throw new Error("Debug file doesn't contain any object definitions");
		}

		const propVals = match[2];
		const propsRex = new RegExp(props, "gim");
		let propMatch = propsRex.exec(propVals);
		if(!propMatch) {
			throw new Error("File does not have any properties")
		}

		const ots = match[1];
		if(ots == "scope") {
			const scope : Scope = {
				id: 0,
				span: null,
				csyms: [],
				spanId: -1,
				size: 0,
				name: "",
			};

			do {
				const key = propMatch[1];
				const val = propMatch[2];

				if(key == "id" || key == "size") {
					scope[key] = parseInt(val);
				}
				else if(key == "span") {
					scope.spanId = parseInt(val);
				}
				else if(key == 'name') {
					scope[key] = val;
				}
			} while (propMatch = propsRex.exec(propVals));

			dbgFile.scopes.push(scope);
		}
		else if(ots == "csym") {
			const csym : CSym = {
				id: 0,
				scopeId: -1,
				sc: sc.auto,
				scope: null,
				sym: null,
				symId: -1,
				offs: 0,
				name: "",
			};

			do {
				const key = propMatch[1];
				const val = propMatch[2];

				if(key == "id" || key == "size" || key == "offs") {
					csym[key] = parseInt(val);
				}
				else if(key == "scope") {
					csym.scopeId = parseInt(val);
				}
				else if(key == 'name') {
					csym[key] = val;
				}
			} while (propMatch = propsRex.exec(propVals));

			dbgFile.csyms.push(csym);
		}
		else if (ots == "sym") {
			const sym : Sym = {
				addrsize: Addrsize.absolute,
				size: 0,
				name: "",
				seg: null,
				segId: -1,
				id: 0,
				def: "",
				ref: 0,
				val: 0,
				type: "",
			}

			do {
				const key = propMatch[1];
				const val = propMatch[2];

				if(key == 'addrsize') {
					sym[key] = Addrsize[key];
				}
				else if(key == 'id' || key == 'val' || key == 'ref' || key == 'size') {
					sym[key] = parseInt(val);
				}
				else if(key == 'name' || key == 'type') {
					sym[key] = val
				}
				else if(key == 'seg') {
					sym.segId = parseInt(val);
				}
			} while (propMatch = propsRex.exec(propVals));

			dbgFile.syms.push(sym);
			if(sym.type == "lab") {
				dbgFile.labs.push(sym);
			}
		}
		else if (ots == "file") {
			const fil : SourceFile = {
				mtime: new Date(),
				name: "",
				mod: "",
				lines: [],
				id: 0,
				size: 0,
			};

			do {
				const key = propMatch[1];
				const val = propMatch[2];

				if(key == "size" || key == "id") {
					fil[key] = parseInt(val);
				}
				else if (key == "mtime") {
					fil[key] = new Date(val);
				}
				else if (key == "name") {
					if(!path.isAbsolute(val)) {
						fil[key] = path.normalize(path.dirname(filename) + "/../" + val);
					}
					else {
						fil[key] = val;
					}
				}
				else if (key == "mod") {
					fil[key] = val;
				}
			} while (propMatch = propsRex.exec(propVals));

			dbgFile.files.push(fil);
		}
		else if (ots == "seg") {
			const seg : CodeSeg = {
				addrsize: Addrsize.relative,
				id: 0,
				name: "",
				oname: "",
				ooffs: 0,
				size: 0,
				start: 0,
				type: 0,
			};

			do {
				const key = propMatch[1];
				const val = propMatch[2];

				if(key == "id" || key == "ooffs" || key == "start" || key == "size") {
					seg[key] = parseInt(val);
				}
				else if (key == "addrsize") {
					seg.addrsize = Addrsize[val];
				}
				else if (key == "name" || key == "oname") {
					seg[key] = val;
				}
				else if (key == "type") {
					seg.type = Segtype[key];
				}
			} while(propMatch = propsRex.exec(propVals));

			dbgFile.segs.push(seg);
		}
		else if(ots == "span") {
			const span : DebugSpan = {
				id: 0,
				start: 0,
				size: 0,
				seg: null,
				type: 0,
				segId: -1,
				lines: [],
				absoluteAddress: 0x80D,
			};

			do {
				const key = propMatch[1];
				const val = propMatch[2];

				if(key == "id" || key == "size" || key == "start" || key == "type") {
					span[key] = parseInt(val);
				}
				else if(key == "seg") {
					span.segId = parseInt(val);
				}
			} while(propMatch = propsRex.exec(propVals));

			dbgFile.spans.push(span);
		}
		else if(ots == "line") {
			const line : SourceLine = {
				count: 0,
				id: 0,
				num: 0,
				span: null,
				spanId: -1,
				file: null,
				fileId: -1,
				type: 0,
			};

			do {
				const key = propMatch[1];
				const val = propMatch[2];

				if(key == "id" || key == "count") {
					line[key] = parseInt(val);
				}
				else if (key == "line") {
					// VSCode wants zero indexed lines so might as well fix it now.
					line.num = parseInt(val) - 1;
				}
				else if (key == "span") {
					line.spanId = parseInt(val);
				}
				else if (key == "file") {
					line.fileId = parseInt(val);
				}
			} while(propMatch = propsRex.exec(propVals));

			dbgFile.lines.push(line);
		}
		else {
			continue;
		}
	} while(match = rex.exec(text))

	for(const span of dbgFile.spans) {
		for(const seg of dbgFile.segs) {
			if(seg.id == span.segId) {
				span.seg = seg
				break
			}
		}

		if(span.seg) {
			span.absoluteAddress = span.seg.start + span.start
		}
	}

	for(const csym of dbgFile.csyms) {
		for(const scope of dbgFile.scopes) {
			if(scope.id == csym.scopeId) {
				csym.scope = scope;
				scope.csyms.push(csym);
				break;
			}
		}
	}

	for(const scope of dbgFile.scopes) {
		scope.csyms.sort((a, b) => a.offs - b.offs);
		for(const span of dbgFile.spans) {
			if(span.id == scope.spanId) {
				scope.span = span;
				break;
			}
		}
	}


	for(const line of dbgFile.lines) {
		for(const file of dbgFile.files) {
			if(line.fileId == file.id) {
				line.file = file;
				file.lines.push(line)
				break
			}
		}

		for(const span of dbgFile.spans) {
			if (span.id == line.spanId) {
				line.span = span
				span.lines.push(line)
				break
			}
		}
	}

	for(const file of dbgFile.files) {
		file.lines.sort((a, b) => a.num - b.num);
	}

	for(const sym of dbgFile.syms) {
		for(const seg of dbgFile.segs) {
			if(seg.id == sym.segId) {
				sym.seg = seg;
				break;
			}
		}
	}

	const spanSort = (a : {span}, b : {span} ) => (b.span && b.span.absoluteAddress)! - (a.span && a.span.absoluteAddress)!;
	dbgFile.scopes.sort(spanSort);
	dbgFile.lines.sort(spanSort)

	dbgFile.spans.sort((a, b) => b.absoluteAddress - a.absoluteAddress)

	const segSort = (a, b) => b.segId - a.segId;
	dbgFile.syms.sort(segSort)
	dbgFile.labs.sort(segSort);

	return dbgFile;
}