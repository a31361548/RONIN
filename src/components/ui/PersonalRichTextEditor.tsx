'use client'

import { useEffect, type ReactElement, type ReactNode } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'

type PersonalRichTextEditorProps = {
  content: string
  onChange: (content: string) => void
}

function ToolbarButton({ active, label, onClick, children }: { active?: boolean; label: string; onClick: () => void; children: ReactNode }): ReactElement {
  return <button type="button" title={label} aria-label={label} onClick={onClick} className={`rounded-xl px-3 py-2 text-xs font-bold transition ${active ? 'bg-[#f6e5d9] text-[#a85b4e]' : 'text-[#776e68] hover:bg-[#faf3ed] hover:text-[#a85b4e]'}`}>{children}</button>
}

export function PersonalRichTextEditor({ content, onChange }: PersonalRichTextEditorProps): ReactElement {
  const editor = useEditor({
    extensions: [StarterKit, Placeholder.configure({ placeholder: '從一個句子開始就好⋯' })],
    content,
    immediatelyRender: false,
    editorProps: { attributes: { class: 'min-h-[360px] px-5 py-4 text-base leading-8 text-[#4a413c] outline-none' } },
    onUpdate: ({ editor: nextEditor }) => onChange(nextEditor.getHTML()),
  })

  useEffect(() => {
    if (editor && editor.getHTML() !== content) editor.commands.setContent(content, { emitUpdate: false })
  }, [content, editor])

  if (!editor) return <div className="min-h-[360px] rounded-b-2xl bg-[#fffdfa]" aria-label="筆記編輯器載入中" />

  return (
    <div className="overflow-hidden rounded-2xl border border-[#e5d9cf] bg-[#fffdfa]">
      <div className="flex flex-wrap gap-1 border-b border-[#f0e5dc] bg-[#fffaf6] p-2">
        <ToolbarButton label="粗體" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><b>B</b></ToolbarButton>
        <ToolbarButton label="斜體" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><i>I</i></ToolbarButton>
        <ToolbarButton label="標題一" active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>H1</ToolbarButton>
        <ToolbarButton label="標題二" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</ToolbarButton>
        <ToolbarButton label="項目清單" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>清單</ToolbarButton>
        <ToolbarButton label="編號清單" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>編號</ToolbarButton>
        <ToolbarButton label="引用" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>引用</ToolbarButton>
        <span className="mx-1 w-px bg-[#eaded4]" aria-hidden="true" />
        <ToolbarButton label="復原" onClick={() => editor.chain().focus().undo().run()}>復原</ToolbarButton>
        <ToolbarButton label="重做" onClick={() => editor.chain().focus().redo().run()}>重做</ToolbarButton>
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}
