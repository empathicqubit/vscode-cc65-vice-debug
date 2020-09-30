import * as ReactDOM from 'react-dom';
import * as React from 'react';

interface vscode {
    postMessage(message: any): void;
}

declare const acquireVsCodeApi : () => vscode;

export function _statsWebviewContent() {
    const vscode = acquireVsCodeApi();

    const r = React.createElement;
    const content = document.querySelector("#content")!;

    document.addEventListener('keydown', evt => {
        evt.preventDefault();
        evt.stopPropagation();
        vscode.postMessage({
            request: 'keydown',
            key: evt.key,
            ctrlKey: evt.ctrlKey,
            shiftKey: evt.shiftKey,
            location: evt.location,
        });

        return false;
    });

    document.addEventListener('keyup', evt => {
        evt.preventDefault();
        evt.stopPropagation();
        vscode.postMessage({
            request: 'keyup',
            key: evt.key,
            ctrlKey: evt.ctrlKey,
            shiftKey: evt.shiftKey,
            location: evt.location,
        });

        return false;
    });

    interface renderData {
        runAheadBlobUrl: string,
        currentBlobUrl: string,
    };

    const data : renderData = {
        currentBlobUrl: '',
        runAheadBlobUrl: '',
    };

    const render = (data: renderData) => {
        const out = r('div', null,
            !data.currentBlobUrl && !data.runAheadBlobUrl
            ? r('h1', 'Loading...')
            : [
                r('div', {className: 'next-frame'},
                    r('h1', null, 'Next Frame'),
                    r('img', { src: data.runAheadBlobUrl }),
                ),
                r('div', {className: 'current-frame'},
                    r('h1', null, 'Current Frame'),
                    r('img', { src: data.currentBlobUrl }),
                ),
            ]
        );

        ReactDOM.render(out, content);
    };

    render(data);

    window.addEventListener('message', async e => {
        try {
            data.currentBlobUrl = URL.createObjectURL(new Blob([new Uint8Array(e.data.current.data)], {type: "image/png"}));
            if(e.data.runAhead) {
                data.runAheadBlobUrl = URL.createObjectURL(new Blob([new Uint8Array(e.data.runAhead.data)], {type: "image/png"}));
            }
        }
        catch(e) {
            console.error(e);
        }

        render(data);
    });
}