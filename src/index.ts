import * as CodeMirror from 'codemirror';

import {
    JupyterFrontEnd, JupyterFrontEndPlugin
} from '@jupyterlab/application';

import {
    INotebookTracker, NotebookActions, NotebookPanel
} from '@jupyterlab/notebook';

import {
    MarkdownCell
} from '@jupyterlab/cells';

import {
    CodeMirrorEditor
} from '@jupyterlab/codemirror';

import {
    ReadonlyPartialJSONObject
} from '@lumino/coreutils';

import {
    ElementExt
} from '@lumino/domutils';

import '../style/index.css';
// Previously the vim keymap was loaded by JupyterLab, but now
// it is lazy loaded, so we have to load it explicitly
import 'codemirror/keymap/vim.js';

/**
 * A boolean indicating whether the platform is Mac.
 */
const IS_MAC = !!navigator.platform.match(/Mac/i);

/**
 * Initialization data for the jupyterlab_vim extension.
 */
const extension: JupyterFrontEndPlugin<void> = {
    id: 'jupyterlab_vim',
    autoStart: true,
    activate: activateCellVim,
    requires: [INotebookTracker]
};

class VimCell {

    constructor(app: JupyterFrontEnd, tracker: INotebookTracker) {
        this._tracker = tracker;
        this._app = app;
        this._onActiveCellChanged();
        this._tracker.activeCellChanged.connect(this._onActiveCellChanged, this);
    }

    private _onActiveCellChanged(): void {
        // if (this._prevActive && !this._prevActive.isDisposed) {
        //     this._prevActive.metadata.changed.disconnect(this._onMetadataChanged, this);
        // }
        let activeCell = this._tracker.activeCell;
        if (activeCell !== null) {
            const {commands} = this._app;
            let editor = activeCell.editor as CodeMirrorEditor;
            editor.setOption('keyMap', 'vim');
            let extraKeys = editor.getOption('extraKeys') || {};

            extraKeys['Esc'] = CodeMirror.prototype.leaveInsertMode;
            if (!IS_MAC) {
                extraKeys['Ctrl-C'] = false;
            }

            CodeMirror.prototype.save = () => {
                commands.execute('docmanager:save');
            };

            editor.setOption('extraKeys', extraKeys);

            let lcm = CodeMirror as any;
            let lvim = lcm.Vim as any;
            lvim.defineEx('quit', 'q', function(cm: any) {
                commands.execute('notebook:enter-command-mode');
            });

            (CodeMirror as any).Vim.handleKey(editor.editor, '<Esc>');
            lvim.defineMotion('moveByLinesOrCell', (cm: any, head: any, motionArgs: any, vim: any) => {
                let cur = head;
                let endCh = cur.ch;
                let currentCell = activeCell;
                // TODO: these references will be undefined
                // Depending what our last motion was, we may want to do different
                // things. If our last motion was moving vertically, we want to
                // preserve the HPos from our last horizontal move.  If our last motion
                // was going to the end of a line, moving vertically we should go to
                // the end of the line, etc.
                switch (vim.lastMotion) {
                    case 'moveByLines':
                    case 'moveByDisplayLines':
                    case 'moveByScroll':
                    case 'moveToColumn':
                    case 'moveToEol':
                        // JUPYTER PATCH: add our custom method to the motion cases
                    case 'moveByLinesOrCell':
                        endCh = vim.lastHPos;
                        break;
                    default:
                        vim.lastHPos = endCh;
                }
                let repeat = motionArgs.repeat + (motionArgs.repeatOffset || 0);
                let line = motionArgs.forward ? cur.line + repeat : cur.line - repeat;
                let first = cm.firstLine();
                let last = cm.lastLine();
                // Vim cancels linewise motions that start on an edge and move beyond
                // that edge. It does not cancel motions that do not start on an edge.

                // JUPYTER PATCH BEGIN
                // here we insert the jumps to the next cells
                if (line < first || line > last) {
                    // var currentCell = ns.notebook.get_selected_cell();
                    // var currentCell = tracker.activeCell;
                    // var key = '';
                    // `currentCell !== null should not be needed since `activeCell`
                    // is already check against null (row 61). Added to avoid warning.
                    if (currentCell !== null && currentCell.model.type === 'markdown') {
                        (currentCell as MarkdownCell).rendered = true;
                        // currentCell.execute();
                    }
                    if (motionArgs.forward) {
                        // ns.notebook.select_next();
                        commands.execute('notebook:move-cursor-down');
                        // key = 'j';
                    } else {
                        // ns.notebook.select_prev();
                        commands.execute('notebook:move-cursor-up');
                        // key = 'k';
                    }
                    // ns.notebook.edit_mode();
                    // var new_cell = ns.notebook.get_selected_cell();
                    // if (currentCell !== new_cell && !!new_cell) {
                    //     // The selected cell has moved. Move the cursor at very end
                    //     var cm2 = new_cell.code_mirror;
                    //     cm2.setCursor({
                    //         ch:   cm2.getCursor().ch,
                    //         line: motionArgs.forward ? cm2.firstLine() : cm2.lastLine()
                    //     });
                    //     // Perform remaining repeats
                    //     repeat = motionArgs.forward ? line - last : first - line;
                    //     repeat -= 1;
                    //     if (Math.abs(repeat) > 0) {
                    //         CodeMirror.Vim.handleKey(cm2, repeat + key);  // e.g. 4j, 6k, etc.
                    //     }
                    // }
                    return;
                }
                // JUPYTER PATCH END

                // if (motionArgs.toFirstChar){
                //     endCh = findFirstNonWhiteSpaceCharacter(cm.getLine(line));
                //     vim.lastHPos = endCh;
                // }
                vim.lastHSPos = cm.charCoords(CodeMirror.Pos(line, endCh), 'div').left;
                return (CodeMirror as any).Pos(line, endCh);
            });

            // lvim.mapCommand(
            //     'k', 'motion', 'moveByLinesOrCell',
            //     { forward: false, linewise: true },
            //     { context: 'normal' }
            // );
            // lvim.mapCommand(
            //     'j', 'motion', 'moveByLinesOrCell',
            //     { forward: true, linewise: true },
            //     { context: 'normal' }
            // );

            // move cell up down
            lvim.defineAction('moveCellDown', (cm: any, actionArgs: any) => {
                commands.execute('notebook:move-cell-down');
            });
            lvim.defineAction('moveCellUp', (cm: any, actionArgs: any) => {
                commands.execute('notebook:move-cell-up');
            });
            // lvim.mapCommand('<C-e>', 'action', 'moveCellDown', {}, {extra: 'normal'});
            // lvim.mapCommand('<C-y>', 'action', 'moveCellUp', {}, {extra: 'normal'});
            
            // split cell by backslash
            lvim.defineAction('splitCell', (cm: any, actionArgs: any) => {
                commands.execute('notebook:split-cell-at-cursor');
            });
            lvim.mapCommand('\\', 'action', 'splitCell', {}, {extra: 'normal'});
            // enter command mode from normal mode by space bar
            (CodeMirror as any).Vim.handleKey(editor.editor, '<Space>');
            lvim.defineAction('normal:enter-command-mode', (cm: any, actionArgs: any) => {
                commands.execute('notebook:enter-command-mode');
            });
            lvim.mapCommand('<Space>', 'action', 'normal:enter-command-mode', {}, {extra: 'normal'});

            // lvim.defineAction('normal:run-cell', (cm: any, actionArgs: any) => {
            //     commands.execute('notebook:run-cell');
            // });
            // lvim.mapCommand('<CR>', 'action', 'normal:run-cell', {}, {extra: 'normal'});

            // run cell and remain in normal mode by enter(carriage return)
            lvim.defineAction('normal:run-cell', (cm: any, actionArgs: any) => {
                commands.execute('notebook:run-cell'); // go to command mode
                commands.execute('notebook:enter-edit-mode'); // go to edit mode
            });
            lvim.mapCommand('<CR>', 'action', 'normal:run-cell', {}, {extra: 'normal'});
        }
    }

    private _tracker: INotebookTracker;
    private _app: JupyterFrontEnd;
}

function activateCellVim(app: JupyterFrontEnd, tracker: INotebookTracker): Promise<void> {

    Promise.all([app.restored]).then(([args]) => {
        const { commands, shell } = app;
        function getCurrent(args: ReadonlyPartialJSONObject): NotebookPanel | null {
            const widget = tracker.currentWidget;
            const activate = args['activate'] !== false;

            if (activate && widget) {
                shell.activateById(widget.id);
            }

            return widget;
        }
        function isEnabled(): boolean {
            return tracker.currentWidget !== null &&
                tracker.currentWidget === app.shell.currentWidget;
        }

        commands.addCommand('run-select-next-edit', {
            label: 'Run Cell and Edit Next Cell',
            execute: args => {
                const current = getCurrent(args);

                if (current) {
                    const { context, content } = current;
                    NotebookActions.runAndAdvance(content, context.sessionContext);
                    current.content.mode = 'edit';
                }
            },
            isEnabled
        });
        commands.addCommand('run-cell-and-edit', {
            label: 'Run Cell and Edit Cell',
            execute: args => {
                const current = getCurrent(args);

                if (current) {
                    const { context, content } = current;
                    NotebookActions.run(content, context.sessionContext);
                    current.content.mode = 'edit';
                }
            },
            isEnabled
        });
        commands.addCommand('cut-cell-and-edit', {
            label: 'Cut Cell(s) and Edit Cell',
            execute: args => {
                const current = getCurrent(args);

                if (current) {
                    const { content } = current;
                    NotebookActions.cut(content);
                    content.mode = 'edit';
                }
            },
            isEnabled
        });
        commands.addCommand('copy-cell-and-edit', {
            label: 'Copy Cell(s) and Edit Cell',
            execute: args => {
                const current = getCurrent(args);

                if (current) {
                    const { content } = current;
                    NotebookActions.copy(content);
                    content.mode = 'edit';
                }
            },
            isEnabled
        });
        commands.addCommand('paste-cell-and-edit', {
            label: 'Paste Cell(s) and Edit Cell',
            execute: args => {
                const current = getCurrent(args);

                if (current) {
                    const { content } = current;
                    NotebookActions.paste(content, 'below');
                    content.mode = 'edit';
                }
            },
            isEnabled
        });
        commands.addCommand('merge-and-edit', {
            label: 'Merge and Edit Cell',
            execute: args => {
                const current = getCurrent(args);

                if (current) {
                    const { content } = current;
                    NotebookActions.mergeCells(content);
                    current.content.mode = 'edit';
                }
            },
            isEnabled
        });
        commands.addCommand('enter-insert-mode', {
            label: 'Enter Insert Mode',
            execute: args => {
                const current = getCurrent(args);

                if (current) {
                    const { content } = current;
                    if (content.activeCell !== null) {
                        let editor = content.activeCell.editor as CodeMirrorEditor;
                        current.content.mode = 'edit';
                        (CodeMirror as any).Vim.handleKey(editor.editor, 'i');
                    }
                }
            },
            isEnabled
        });
        commands.addCommand('leave-insert-mode', {
            label: 'Leave Insert Mode',
            execute: args => {
                const current = getCurrent(args);

                if (current) {
                    const { content } = current;
                    if (content.activeCell !== null) {
                        let editor = content.activeCell.editor as CodeMirrorEditor;
                        (CodeMirror as any).Vim.handleKey(editor.editor, '<Esc>');
                    }
                }
            },
            isEnabled
        });
        commands.addCommand('select-below-execute-markdown', {
            label: 'Execute Markdown and Select Cell Below',
            execute: args => {
                const current = getCurrent(args);

                if (current) {
                    const { content } = current;
                    if (content.activeCell !== null &&
                        content.activeCell.model.type === 'markdown') {
                        (current.content.activeCell as MarkdownCell).rendered = true;
                    }
                    return NotebookActions.selectBelow(current.content);
                }
            },
            isEnabled
        });
        commands.addCommand('select-above-execute-markdown', {
            label: 'Execute Markdown and Select Cell Below',
            execute: args => {
                const current = getCurrent(args);

                if (current) {
                    const { content } = current;
                    if (content.activeCell !== null &&
                        content.activeCell.model.type === 'markdown') {
                        (current.content.activeCell as MarkdownCell).rendered = true;
                    }
                    return NotebookActions.selectAbove(current.content);
                }
            },
            isEnabled
        });
        commands.addCommand('select-first-cell', {
            label: 'Select First Cell',
            execute: args => {
                const current = getCurrent(args);

                if (current) {
                    const { content } = current;
                    content.activeCellIndex = 0;
                    content.deselectAll();
                    if (content.activeCell !== null) {
                        ElementExt.scrollIntoViewIfNeeded(
                            content.node,
                            content.activeCell.node
                        );
                    }
                }
            },
            isEnabled
        });
        commands.addCommand('select-last-cell', {
            label: 'Select Last Cell',
            execute: args => {
                const current = getCurrent(args);

                if (current) {
                    const { content } = current;
                    content.activeCellIndex = current.content.widgets.length - 1;
                    content.deselectAll();
                    if (content.activeCell !== null) {
                        ElementExt.scrollIntoViewIfNeeded(
                            content.node,
                            content.activeCell.node
                        );
                    }
                }
            },
            isEnabled
        });
        commands.addCommand('center-cell', {
            label: 'Center Cell',
            execute: args => {
                const current = getCurrent(args);

                if (current && current.content.activeCell != null) {
                    let er = current.content.activeCell.inputArea.node.getBoundingClientRect();
                    current.content.scrollToPosition(er.bottom, 0);
                }
            },
            isEnabled
        });

        // key binding start
        commands.addKeyBinding({
            selector: '.jp-Notebook.jp-mod-editMode',
            keys: ['Escape'],
            command: 'leave-insert-mode'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook.jp-mod-editMode',
            keys: ['Ctrl ['],
            command: 'leave-insert-mode'
        });
        // commands.addKeyBinding({
        //     selector: '.jp-Notebook:focus',
        //     keys: ['Ctrl I'],
        //     command: 'enter-insert-mode'
        // });
        //// run cell commands remain in cell
        commands.addKeyBinding({
            selector: '.jp-Notebook:focus', // command mode 
            keys: ['Enter'],
            command: 'notebook:run-cell'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook.jp-mod-editMode',
            keys: ['Ctrl Enter'],
            command: 'run-cell-and-edit'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook.jp-mod-editMode',
            keys: ['Shift Enter'],
            command: 'run-select-next-edit'
        });
        // commands.addKeyBinding({
        //     selector: '.jp-Notebook.jp-mod-editMode',
        //     keys: ['Shift Escape'],
        //     command: 'notebook:enter-command-mode'
        // });
        commands.addKeyBinding({
            selector: '.jp-Notebook:focus',
            keys: ['Shift M'],
            command: 'merge-and-edit'
        });
        // Cell to Code, Markdown, Raw
        commands.addKeyBinding({
            selector: '.jp-Notebook:focus',
            keys: ['C'],
            command: 'notebook:change-cell-to-code'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook:focus',
            keys: ['M'],
            command: 'notebook:change-cell-to-markdown'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook:focus',
            keys: ['R'],
            command: 'notebook:change-cell-to-raw'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook:focus',
            keys: ['G', 'G'],
            command: 'select-first-cell'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook:focus',
            keys: ['Shift G'],
            command: 'select-last-cell'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook:focus',
            keys: ['Y'],
            command: 'notebook:copy-cell'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook:focus',
            keys: ['D'],
            command: 'notebook:delete-cell'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook:focus',
            keys: ['Shift P'],
            command: 'notebook:paste-cell-above'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook:focus',
            keys: ['P'],
            command: 'notebook:paste-cell-below'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook:focus',
            keys: ['O'],
            command: 'notebook:insert-cell-below'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook:focus',
            keys: ['Shift O'],
            command: 'notebook:insert-cell-above'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook:focus',
            keys: ['U'],
            command: 'notebook:undo-cell-action'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook:focus',
            keys: ['Shift U'],
            command: 'notebook:redo-cell-action'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook:focus',
            keys: ['Ctrl J'],
            command: 'notebook:move-cell-down'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook:focus',
            keys: ['Ctrl K'],
            command: 'notebook:move-cell-up'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook:focus',
            keys: ['H', 'C'],
            command: 'notebook:hide-cell-code'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook:focus',
            keys: ['H', 'O'],
            command: 'notebook:hide-cell-outputs'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook:focus',
            keys: ['S', 'C'],
            command: 'notebook:show-cell-code'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook:focus',
            keys: ['S', 'O'],
            command: 'notebook:show-cell-outputs'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook:focus',
            keys: ['L'],
            command: 'editmenu:clear-current'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook.jp-mod-editMode .jp-InputArea-editor:not(.jp-mod-has-primary-selection)',
            keys: ['Ctrl G'],
            command: 'tooltip:launch-notebook'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook:focus',
            keys: ['Space'],
            command: 'notebook:enter-edit-mode'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook:focus',
            keys: ['A'],
            command: 'notebook:select-all'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook:focus',
            keys: ['Ctrl Shift J'],
            command: 'notebook:extend-marked-cells-bottom'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook:focus',
            keys: ['Ctrl Shift K'],
            command: 'notebook:extend-marked-cells-top'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook:focus',
            keys: ['W'],
            command: 'docmanager:save'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook:focus',
            keys: ['Q'],
            command: 'application:close'
        });
        commands.addKeyBinding({
            selector: 'body',
            keys: ['Alt T'],
            command: 'application:toggle-mode'
        });
        commands.addKeyBinding({
            selector: 'body',
            keys: ['Alt R'],
            command: 'docmanager:reload'
        });
        commands.addKeyBinding({
            selector: 'body',
            keys: ['Alt P'],
            command: 'jupytext:auto:percent'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook:focus',
            keys: ['B'],
            command: 'application:toggle-presentation-mode'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook:focus',
            keys: ['X'],
            command: 'notebook:cut-cell'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook:focus',
            keys: ['V'],
            command: ''
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook:focus',
            keys: ['Z'],
            command: ''
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook:focus',
            keys: ['N'],
            command: 'notebook:toggle-all-cell-line-numbers'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook:focus',
            keys: ['E', 'E'],
            command: 'notebook:run-all-cells'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook:focus',
            keys: ['E', 'A'],
            command: 'notebook:run-all-above'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook:focus',
            keys: ['E', 'B'],
            command: 'notebook:run-all-below'
        });
        // key binding end
        // tslint:disable:no-unused-expression
        new VimCell(app, tracker);
    });

    return Promise.resolve();
}

export default extension;
