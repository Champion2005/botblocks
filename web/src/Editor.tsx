import { useEffect, useRef } from 'react'
import { EditorView, keymap } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { python } from '@codemirror/lang-python'
import { oneDark } from '@codemirror/theme-one-dark'

export default function Editor({ value, onChange }: { value: string, onChange: (v: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)

  useEffect(() => {
    if (!ref.current) return
    const v = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [ oneDark, python(), history(),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          EditorView.updateListener.of(u => { if (u.docChanged) onChange(u.state.doc.toString()) }),
          EditorView.theme({ '&': { flex: '1', fontSize: '15px' } }),
        ],
      }),
      parent: ref.current,
    })
    view.current = v
    return () => v.destroy()
  }, [])

  return <div ref={ref} style={{ overflow: 'auto', flex: '1', display: 'flex', height: '100%' }} />
}
