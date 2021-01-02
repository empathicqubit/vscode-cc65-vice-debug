import * as ReactDOM from 'react-dom';
import * as React from 'react';
import * as reactTabs from 'react-tabs';
import classNames from 'classnames';
import _sortBy from 'lodash/fp/sortBy';
import _chunk from 'lodash/fp/chunk';
import marked from 'marked';
import { screenMappings } from './screen-mappings';

interface vscode {
    postMessage(message: {[key: string]: any, request: string}): void;
}

declare const acquireVsCodeApi : () => vscode;

export function _statsWebviewContent() {
    const parseText = (text: string) : string => {
        const stringBuilder = new Array<string>(text.length);
        let i = 0;
        Array.from(text).forEach((chr, d) => {
            const code = chr.charCodeAt(0);
            if(chr == '\n') {
                stringBuilder[i] = '\n';
                i++;
                return;
            }

            const baseChar = code % 0x80;
            const reverse = code / 0x80 > 1;
            stringBuilder[i] = screenMappings.find(x => x.screen == baseChar)!.gfx;
            i++;
        });

        return stringBuilder.join('');
    };

    const renderMemory = (memory: number[]) : React.ReactElement => {
        const arr = new Array<string>(memory.length + memory.length / 16 + 1);
        arr[0] = '';
        let offset = 1;
        for(let i = 0; i < memory.length; i++) {
            if(i && !(i % 16)) {
                arr[offset] = '\n';
                offset++;
            }

            arr[offset] = memory[i].toString(16).padStart(2, '0');
            offset++;
        }

        return r('code', null, r('pre', null, arr.join(' ')));
    };

    const renderScreenText = (screenText: screenData, enableColors: boolean) : React.ReactElement => {
        if(!screenText) {
            return r('pre');
        }

        const arr = new Uint8Array((screenText.data.length + screenText.height) * 2);
        let outputOffset = 0;
        for(let i = 0; i < screenText.data.length; i++) {
            if(i && !(i % screenText.width)) {
                arr[outputOffset] = '\n'.charCodeAt(0);
                outputOffset++;
                arr[outputOffset] = 0x00;
                outputOffset++;
            }

            arr[outputOffset] = screenText.data[i];
            outputOffset++;
            arr[outputOffset] = 0xee;
            outputOffset++;
        }

        const text = new TextDecoder('utf-16le').decode(arr);
        if(!enableColors) {
            return r('pre', null, text);
        }

        const palette = screenText.palette.map(x => ({
            style: {
                color: '#' + (x >>> 8).toString(16),
            }
        }));

        const elems = new Array<React.ReactElement>(text.length);
        outputOffset = 0;
        let colorOffset = 0;
        for(let i = 0; i < text.length; i++) {
            const chr = text[i];
            if(chr == '\n') {
                elems[outputOffset] = r('br');
                outputOffset++;
                continue;
            }

            const style = palette[screenText.colors[colorOffset] & 0xf];
            colorOffset++;

            // FIXME Would be faster if you used classes
            elems[outputOffset] = r('span', style, chr);
            outputOffset++;
        }

        return r('pre', null, elems);
    };

    const copyScreenText = (e : ClipboardEvent) : void => {
        if(!e.clipboardData) {
            return;
        }
        e.clipboardData.setData('text/plain', parseText(document.getSelection()!.toString()))
        e.preventDefault();
    }

    const keydown = (evt: React.KeyboardEvent<HTMLDivElement>) : void => {
        evt.preventDefault();
        evt.stopPropagation();
        vscode.postMessage({
            request: 'keydown',
            key: evt.key,
            ctrlKey: evt.ctrlKey,
            shiftKey: evt.shiftKey,
            location: evt.location,
        });
    };

    const keyup = (evt: React.KeyboardEvent<HTMLDivElement>) : void => {
        evt.preventDefault();
        evt.stopPropagation();
        vscode.postMessage({
            request: 'keyup',
            key: evt.key,
            ctrlKey: evt.ctrlKey,
            shiftKey: evt.shiftKey,
            location: evt.location,
        });
    };

    const r = React.createElement;

    interface spriteData extends ImageData {
        key: string;
        blobUrl: string;
        isEnabled: boolean;
    }

    interface screenData extends ImageData {
        colors: number[];
        palette: number[];
    }

    interface renderProps {
        runAhead: spriteData | null,
        current: spriteData | null,
        sprites: spriteData[],
        screenText: screenData | null,
        enableColors: boolean,
        memory: number[],
        memoryOffset: number,
    };

    class Hider extends React.Component<unknown, { visible: boolean }, unknown> {
        constructor(props) {
            super(props);
            this.state = { visible: false };
        }
        toggleVisible() {
            this.setState({ visible: !this.state.visible })
        }
        render() {
            return r('div', { className: 'hider', onClick: () => this.toggleVisible() },
                r('button', { className: 'hider__info' }, '🛈'),
                this.state.visible
                ? r('div', { className: 'hider__content' },
                    this.props.children
                )
                : null
            );
        }
    }

    class Main extends React.PureComponent<renderProps> {
        render() {
            return r(reactTabs.Tabs, { className: 'all-tabs'}, 
                r(reactTabs.TabList, null,
                    r(reactTabs.Tab, null, 'Display (Current)'),
                    !this.props.runAhead ? null : r(reactTabs.Tab, null, 'Display (Next)'),
                    r(reactTabs.Tab, null, 'Sprites'),
                    r(reactTabs.Tab, null, 'Text'),
                    r(reactTabs.Tab, null, 'Memory'),
                ),
                r(reactTabs.TabPanel, { 
                    className: 'current-frame',
                    onKeyDown: keydown,
                    onKeyUp: keyup,
                },
                    r(Hider, null, 
                        r('div', { dangerouslySetInnerHTML: { __html: marked(`
This is a duplicate of the screen from the emulator. This is useful if you're
running headless. The screen and other tabs are updated once per second.
Pressing keys inside this tab will send them to the emulator. The mapping is
similar to VICE's default. Tab is C=.
                        `)}}),
                    ),
                    !this.props.current
                        ? r('h1', null, 'Loading...')
                        : r('img', { src: this.props.current.blobUrl }),
                ),
                !this.props.runAhead
                    ? null
                    : r(reactTabs.TabPanel, {
                        className: 'next-frame',
                    },
                        r(Hider, null, 
                            r('div', { dangerouslySetInnerHTML: { __html: marked(`
The next frame after the current one. Your changes may not be immediately shown
on the current screen, due to the way the raster works, so you can try looking
here instead.
                            `)}}),
                        ),
                        r('img', { src: this.props.runAhead.blobUrl }),
                    ),
                r(reactTabs.TabPanel, { className: 'sprites' },
                    r(Hider, null, 
                        r('div', { dangerouslySetInnerHTML: { __html: marked(`
The sprites in the current bank, from the lowest visible
to the highest visible. Dim sprites are ones which are
not currently displayed. If the sprite isn't visible,
the 64th byte is used to guess whether it is a
multicolor (bit 7) and what the sprite color is (bit 0-3).
The [SpritePad format](https://www.spritemate.com/) uses this convention.
                        `)}}),
                    ),
                    !this.props.sprites || !this.props.sprites.length
                        ? r('h1', null, 'Loading...')
                        : this.props.sprites.map(x =>
                            r('img', { className: !x.isEnabled ? 'disabled' : '', key: x.key, alt: x.key, src: x.blobUrl })
                        ),
                ),
                r(reactTabs.TabPanel, { className: 'screentext' },
                    r(Hider, null, 
                        r('div', { dangerouslySetInnerHTML: { __html: marked(`
The text currently displayed on the screen. You can toggle the checkbox to enable
or disable colors. You can select the text and copy it to your clipboard.
                        `)}}),
                    ),
                    !this.props.screenText
                        ? r('h1', null, 'Loading...')
                        : r('code', { onCopy: copyScreenText },
                            renderScreenText(this.props.screenText, this.props.enableColors),
                        ),
                    r("label", { htmlFor: 'enable-colors' },
                        r("input", { id: 'enable-colors', type: "checkbox", checked: this.props.enableColors, onChange: toggleColors }),
                        r("span"),
                        "Enable colors"
                    ),
                ),
                r(reactTabs.TabPanel, { className: 'memview' },
                    r('input', { 
                        type: 'number', 
                        id: 'memview__offset', 
                        value: this.props.memoryOffset, 
                        step: 0x40,
                        min: 0x0000,
                        max: 0xF000,
                        onKeyDown: () => false,
                        onChange: changeOffset,
                    }),
                    r('label', { htmlFor: 'memview__offset' },
                        '$' + this.props.memoryOffset.toString(16).padStart(4, '0')),
                    renderMemory(this.props.memory),
                ),
            );
        }
    }

    const vscode = acquireVsCodeApi();

    const content = document.querySelector("#content")!;

    const data : renderProps = {
        runAhead: null,
        current: null,
        screenText: null,
        sprites: [],
        enableColors: true,
        memory: [],
        memoryOffset: 0,
    };

    const rerender = () => ReactDOM.render((r as any)(Main, data), content);

    const toggleColors = (e) => {
        data.enableColors = !!e.target.checked;

        rerender();
    };

    const changeOffset = (e) => {
        data.memoryOffset = parseInt(e.target.value);

        vscode.postMessage({
            request: 'offset',
            offset: data.memoryOffset,
        });

        rerender();
    };

    window.addEventListener('message', async e => {
        try {
            const msgData : renderProps = e.data;
            if((msgData as any).reset) {
                data.current = null;
                data.runAhead = null;
                data.sprites = [];
                return;
            }

            if(msgData.memory) {
                const m = msgData.memory;
                if(!data.memory || data.memory.length != m.length || !data.memory.every((x, i) => m[i] == x)) {
                    data.memory = m;
                }
            }
            if(msgData.screenText) {
                const s = msgData.screenText;
                if(!data.screenText || data.screenText.data.length != s.data.length || !data.screenText.data.every((x, i) => s.data[i] == x)) {
                    data.screenText = s;
                }
            }
            if(msgData.current) {
                const c = msgData.current;
                if(!data.current || data.current.data.length != c.data.length || !data.current.data.every((x, i) => c.data[i] == x)) {
                    data.current = {
                        ...c,
                        blobUrl: URL.createObjectURL(new Blob([new Uint8Array(c.data)], {type: 'image/png' })),
                    }
                }
            }
            if(msgData.runAhead) {
                const r = msgData.runAhead;
                if(!data.runAhead || data.runAhead.data.length != r.data.length || !data.runAhead.data.every((x, i) => r.data[i] == x)) {
                    data.runAhead = {
                        ...r,
                        blobUrl: URL.createObjectURL(new Blob([new Uint8Array(r.data)], {type: 'image/png' })),
                    }
                }
            }
            if(msgData.sprites && msgData.sprites.length) {
                // Add / Modify
                for(const sprite of msgData.sprites) {
                    const newSprite = () : spriteData => ({
                        ...sprite,
                        blobUrl: URL.createObjectURL(new Blob([new Uint8Array(sprite.data)], {type: 'image/png' })),
                    });
                    let existingIndex = -1;
                    const existing = data.sprites.find((x, i) => {
                        existingIndex = i;
                        return x.key == sprite.key;
                    });
                    if(!existing) {
                        data.sprites = _sortBy(x => x.key, [...data.sprites, newSprite()]);
                        continue;
                    }

                    if(existing.data.length != sprite.data.length || !existing.data.every((x, i) => sprite.data[i] == x)) {
                        data.sprites[existingIndex] = newSprite();
                    }
                    else if(existing.isEnabled != sprite.isEnabled) {
                        data.sprites[existingIndex] = {
                            ...sprite,
                            blobUrl: existing.blobUrl,
                        }
                    }

                }

                // Remove
                /*
                for(const s in data.sprites) {
                    const sprite = data.sprites[s];
                    const old = msgData.sprites.find(x => x.key == sprite.key);
                    if(!old) {
                        data.sprites.splice(parseInt(s), 1);
                    }
                }
                */
            }
        }
        catch(e) {
            console.error(e);
        }


        rerender();
    });
}
