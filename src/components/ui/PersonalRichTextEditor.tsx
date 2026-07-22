'use client'

import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties, type ReactElement, type ReactNode } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import Color from '@tiptap/extension-color'
import Placeholder from '@tiptap/extension-placeholder'
import { TextStyle } from '@tiptap/extension-text-style'
import StarterKit from '@tiptap/starter-kit'

type ToolbarButtonProps = {
  active?: boolean
  disabled?: boolean
  label: string
  onClick: () => void
  children: ReactNode
}

type TextColorOption = {
  label: string
  value: string
}

type PersonalRichTextEditorProps = {
  content: string
  onChange: (content: string) => void
}

const textColorOptions: readonly TextColorOption[] = [
  { label: '珊瑚紅', value: '#d86f62' },
  { label: '暖橘色', value: '#c9864a' },
  { label: '金黃色', value: '#c49a3a' },
  { label: '鼠尾草綠', value: '#6f967c' },
  { label: '晴空藍', value: '#668bad' },
  { label: '柔和紫', value: '#8d789b' },
]

function ToolbarButton({ active = false, disabled = false, label, onClick, children }: ToolbarButtonProps): ReactElement {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={`rounded-xl px-3 py-2 text-xs font-bold transition ${disabled ? 'cursor-not-allowed opacity-40' : active ? 'bg-[#f6e5d9] text-[#a85b4e]' : 'text-[#776e68] hover:bg-[#faf3ed] hover:text-[#a85b4e]'}`}
    >
      {children}
    </button>
  )
}

function TextColorButton({ option, active, onClick }: { option: TextColorOption; active: boolean; onClick: () => void }): ReactElement {
  const swatchStyle: CSSProperties = { backgroundColor: option.value }

  return (
    <button
      type="button"
      title={`文字顏色：${option.label}`}
      aria-label={`文字顏色：${option.label}`}
      aria-pressed={active}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      style={swatchStyle}
      className={`h-5 w-5 rounded-full border-2 border-white shadow-sm transition hover:scale-110 ${active ? 'ring-2 ring-[#a85b4e] ring-offset-1' : ''}`}
    />
  )
}

function comparableEditorContent(content: string): string {
  return content.trim() === '' ? '<p></p>' : content
}

function readTextColor(attributes: unknown): string | undefined {
  if (typeof attributes !== 'object' || attributes === null) return undefined

  const color = (attributes as { color?: unknown }).color
  return typeof color === 'string' ? color : undefined
}

export function PersonalRichTextEditor({ content, onChange }: PersonalRichTextEditorProps): ReactElement {
  const lastEmittedContent = useRef<string | null>(null)
  const [customColor, setCustomColor] = useState('#d86f62')
  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyle,
      Color.configure({ types: ['textStyle'] }),
      Placeholder.configure({ placeholder: '從一個句子開始就好⋯' }),
    ],
    content,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: [
          'personal-rich-editor min-h-[360px] px-5 py-4 text-base leading-8 text-[#4a413c] outline-none',
          '[&_h1]:my-4 [&_h1]:text-3xl [&_h1]:font-extrabold [&_h1]:leading-tight [&_h1]:text-[#3f3530]',
          '[&_h2]:my-3 [&_h2]:text-2xl [&_h2]:font-extrabold [&_h2]:leading-tight [&_h2]:text-[#4a413c]',
          '[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-7',
          '[&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-7',
          '[&_li]:my-1',
          '[&_blockquote]:my-4 [&_blockquote]:border-l-4 [&_blockquote]:border-[#e98a7a] [&_blockquote]:bg-[#fff4ee] [&_blockquote]:px-4 [&_blockquote]:py-2 [&_blockquote]:italic [&_blockquote]:text-[#776e68]',
        ].join(' '),
      },
    },
    onCreate: ({ editor: nextEditor }) => {
      lastEmittedContent.current = nextEditor.getHTML()
    },
    onUpdate: ({ editor: nextEditor }) => {
      const nextContent = nextEditor.getHTML()
      lastEmittedContent.current = nextContent
      onChange(nextContent)
    },
  })

  useEffect(() => {
    if (!editor) return

    const nextContent = comparableEditorContent(content)
    if (lastEmittedContent.current === nextContent || editor.getHTML() === nextContent) return

    editor.commands.setContent(content, { emitUpdate: false })
    lastEmittedContent.current = editor.getHTML()
  }, [content, editor])

  if (!editor) return <div className="min-h-[360px] rounded-b-2xl bg-[#fffdfa]" aria-label="筆記編輯器載入中" />

  const activeColor = readTextColor(editor.getAttributes('textStyle'))
  const applyTextColor = (value: string): void => {
    setCustomColor(value)
    editor.chain().focus().setColor(value).run()
  }
  const handleCustomColorChange = (event: ChangeEvent<HTMLInputElement>): void => {
    applyTextColor(event.target.value)
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[#e5d9cf] bg-[#fffdfa]">
      <div className="flex flex-wrap items-center gap-1 border-b border-[#f0e5dc] bg-[#fffaf6] p-2">
        <ToolbarButton label="粗體" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><b>B</b></ToolbarButton>
        <ToolbarButton label="斜體" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><i>I</i></ToolbarButton>
        <ToolbarButton label="標題一（整段標題）" active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>H1</ToolbarButton>
        <ToolbarButton label="標題二（整段標題）" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</ToolbarButton>
        <ToolbarButton label="項目清單" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>清單</ToolbarButton>
        <ToolbarButton label="編號清單" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>編號</ToolbarButton>
        <ToolbarButton label="引用" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>引用</ToolbarButton>
        <div className="mx-1 flex items-center gap-1 rounded-xl border border-[#eaded4] bg-white/70 px-2 py-1" aria-label="文字顏色">
          <span className="mr-1 text-xs font-black" style={{ color: activeColor ?? '#4a413c' }}>A</span>
          {textColorOptions.map((option) => (
            <TextColorButton
              key={option.value}
              option={option}
              active={activeColor?.toLowerCase() === option.value}
              onClick={() => applyTextColor(option.value)}
            />
          ))}
          <label title="自訂文字顏色" className="relative ml-1 flex h-5 w-5 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-white shadow-sm ring-1 ring-[#d9c9bd] transition hover:scale-110">
            <span className="sr-only">自訂文字顏色</span>
            <input type="color" value={customColor} onChange={handleCustomColorChange} className="h-7 w-7 cursor-pointer border-0 bg-transparent p-0" />
          </label>
          <button
            type="button"
            title="移除文字顏色"
            aria-label="移除文字顏色"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => editor.chain().focus().unsetColor().run()}
            className="ml-1 rounded-lg px-1.5 py-0.5 text-xs font-bold text-[#a79b91] transition hover:bg-[#faf3ed] hover:text-[#a85b4e]"
          >
            ×
          </button>
        </div>
        <span className="mx-1 h-6 w-px bg-[#eaded4]" aria-hidden="true" />
        <ToolbarButton label="復原" disabled={!editor.can().chain().focus().undo().run()} onClick={() => editor.chain().focus().undo().run()}>復原</ToolbarButton>
        <ToolbarButton label="重做" disabled={!editor.can().chain().focus().redo().run()} onClick={() => editor.chain().focus().redo().run()}>重做</ToolbarButton>
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}
