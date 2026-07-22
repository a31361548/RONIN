'use client'

import Cropper, { type Area } from 'react-easy-crop'
import { useEffect, useRef, useState, type ChangeEvent, type ReactElement } from 'react'
import { useSession } from 'next-auth/react'
import { PersonalTagManager } from '@/components/settings/PersonalTagManager'
import { PersonalToast, type PersonalToastState } from '@/components/ui/PersonalToast'

type SettingsUser = { name: string | null; email: string; avatar: string | null; coins: number }
type Surface = 'cream' | 'sage' | 'sky'
type CropPoint = { x: number; y: number }

const SURFACE_OPTIONS: Array<{ value: Surface; label: string; description: string; color: string }> = [
  { value: 'cream', label: '奶油暖白', description: '日隅預設色，柔和而清楚', color: '#fff9f4' },
  { value: 'sage', label: '鼠尾草綠', description: '安靜一點，適合長時間整理', color: '#f3f7f0' },
  { value: 'sky', label: '晴空淡藍', description: '清爽一點，讓頁面更有空氣感', color: '#f1f6fb' },
]

function AvatarPreview({ name, avatar }: { name: string; avatar: string | null }): ReactElement {
  const imageRef = useRef<HTMLImageElement>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => { setFailed(false); if (imageRef.current?.complete && imageRef.current.naturalWidth === 0) setFailed(true) }, [avatar])
  if (avatar && !failed) return <img ref={imageRef} src={avatar} alt="目前頭像" onError={() => setFailed(true)} className="h-24 w-24 rounded-[2rem] object-cover" />
  return <span className="flex h-24 w-24 items-center justify-center rounded-[2rem] bg-[#f3d8c8] text-3xl font-bold text-[#a85b4e]">{name.slice(0, 1)}</span>
}

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => { const image = new window.Image(); image.addEventListener('load', () => resolve(image)); image.addEventListener('error', () => reject(new Error('圖片讀取失敗'))); image.src = url })
}

async function createCroppedBlob(imageUrl: string, crop: Area): Promise<Blob> {
  const image = await createImage(imageUrl)
  const canvas = document.createElement('canvas')
  canvas.width = crop.width
  canvas.height = crop.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('瀏覽器不支援圖片裁切')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height)
  return new Promise((resolve, reject) => { canvas.toBlob((blob) => { if (blob) resolve(blob); else reject(new Error('圖片裁切失敗')) }, 'image/jpeg', 0.92) })
}

export function PersonalSettingsPage({ user }: { user: SettingsUser }): ReactElement {
  const { update } = useSession()
  const displayName = user.name || user.email.split('@')[0]
  const [avatar, setAvatar] = useState(user.avatar)
  const [surface, setSurface] = useState<Surface>('cream')
  const [uploading, setUploading] = useState(false)
  const [toast, setToast] = useState<PersonalToastState | null>(null)
  const [cropSource, setCropSource] = useState<string | null>(null)
  const [crop, setCrop] = useState<CropPoint>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [cropAreaPixels, setCropAreaPixels] = useState<Area | null>(null)

  useEffect(() => { const savedSurface = window.localStorage.getItem('riyu-surface') as Surface | null; if (savedSurface === 'cream' || savedSurface === 'sage' || savedSurface === 'sky') setSurface(savedSurface) }, [])
  useEffect(() => { if (!cropSource) return; return () => URL.revokeObjectURL(cropSource) }, [cropSource])

  const saveAvatar = async (nextAvatar: string): Promise<void> => {
    const response = await fetch('/api/user/avatar', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ avatar: nextAvatar }) })
    if (!response.ok) throw new Error('頭像更新失敗')
    setAvatar(nextAvatar)
    await update({ avatar: nextAvatar })
  }

  const handleFileSelection = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) { setToast({ tone: 'error', message: '請選擇圖片檔案' }); return }
    if (file.size > 5 * 1024 * 1024) { setToast({ tone: 'error', message: '圖片請小於 5MB' }); return }
    setToast(null)
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setCropAreaPixels(null)
    setCropSource(URL.createObjectURL(file))
  }

  const closeCrop = (): void => { if (!uploading) { setCropSource(null); setCropAreaPixels(null) } }

  const confirmCrop = async (): Promise<void> => {
    if (!cropSource || !cropAreaPixels) { setToast({ tone: 'error', message: '請先完成圖片裁切' }); return }
    setUploading(true)
    setToast(null)
    try {
      const croppedBlob = await createCroppedBlob(cropSource, cropAreaPixels)
      const formData = new FormData()
      formData.append('file', croppedBlob, 'riyu-avatar.jpg')
      const uploadResponse = await fetch('/api/upload', { method: 'POST', body: formData })
      if (!uploadResponse.ok) throw new Error('圖片上傳失敗')
      const data = (await uploadResponse.json()) as { url: string }
      await saveAvatar(data.url)
      setCropSource(null)
      setCropAreaPixels(null)
      setToast({ tone: 'success', message: '頭像已裁切並套用' })
    } catch (error) { setToast({ tone: 'error', message: error instanceof Error ? error.message : '圖片上傳失敗' }) } finally { setUploading(false) }
  }

  const handleSurfaceChange = (nextSurface: Surface): void => {
    setSurface(nextSurface)
    window.localStorage.setItem('riyu-surface', nextSurface)
    window.dispatchEvent(new CustomEvent('riyu-surface-change', { detail: nextSurface }))
    setToast({ tone: 'success', message: '工作區背景偏好已更新' })
  }

  return (
    <div className="space-y-6" data-testid="settings-page">
      <header><p className="text-sm font-semibold tracking-[0.14em] text-[#c96b61]">把日隅調整成你的樣子</p><h1 className="mt-2 text-4xl font-bold tracking-tight text-[#2e2a28] sm:text-5xl">設定</h1><p className="mt-3 text-base leading-7 text-[#776e68]">管理頭像、工作區外觀與你的基本帳號資訊。</p></header>
      <section className="rounded-[2rem] border border-[#eaded4] bg-[#fffdfa] p-5 shadow-[0_16px_44px_rgba(112,82,62,0.08)] sm:p-7"><div className="flex flex-col gap-5 sm:flex-row sm:items-center"><AvatarPreview name={displayName} avatar={avatar}/><div className="flex-1"><p className="text-sm font-bold text-[#2e2a28]">{displayName}</p><p className="mt-1 text-sm text-[#8d7f76]">{user.email}</p><p className="mt-3 text-xs text-[#a79b91]">登入帳號與密碼由管理員協助管理。</p></div><label className="cursor-pointer rounded-2xl bg-[#e98a7a] px-5 py-3 text-center text-sm font-bold text-white transition hover:bg-[#d97568] sm:self-start">選擇並裁切頭像<input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFileSelection} disabled={uploading} className="hidden"/></label></div></section>
      <section className="rounded-[2rem] border border-[#eaded4] bg-[#fffdfa] p-5 shadow-[0_16px_44px_rgba(112,82,62,0.08)] sm:p-7"><div><p className="text-sm font-bold text-[#2e2a28]">工作區背景</p><p className="mt-1 text-sm text-[#8d7f76]">先從整體背景開始，之後再加入更多可自由調整的風格。</p></div><div className="mt-5 grid gap-3 sm:grid-cols-3">{SURFACE_OPTIONS.map((option) => <button key={option.value} type="button" onClick={() => handleSurfaceChange(option.value)} className={`rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 ${surface === option.value ? 'border-[#d97568] bg-[#fff4ee]' : 'border-[#eaded4] bg-[#fffdfa] hover:border-[#d9a59a]'}`}><span className="block h-12 rounded-xl border border-white/70" style={{ backgroundColor: option.color }}/><span className="mt-3 block text-sm font-bold text-[#4a413c]">{option.label}</span><span className="mt-1 block text-xs leading-5 text-[#9a8c83]">{option.description}</span></button>)}</div></section>
      <PersonalTagManager />
      <PersonalToast toast={toast} onDismiss={() => setToast(null)}/>
      {cropSource && <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2e2a28]/55 px-4 py-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="crop-avatar-title"><div className="w-full max-w-xl rounded-[2rem] border border-[#eaded4] bg-[#fffdfa] p-5 shadow-[0_24px_80px_rgba(46,42,40,0.24)] sm:p-7"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold tracking-[0.12em] text-[#c96b61]">調整頭像</p><h2 id="crop-avatar-title" className="mt-1 text-2xl font-bold text-[#2e2a28]">裁切成你喜歡的樣子</h2><p className="mt-2 text-sm leading-6 text-[#776e68]">拖曳圖片調整位置，再用滑桿放大或縮小。</p></div><button type="button" onClick={closeCrop} disabled={uploading} aria-label="關閉裁切視窗" className="rounded-full px-3 py-2 text-xl text-[#8d7f76] transition hover:bg-[#faf0e8] hover:text-[#a85b4e] disabled:opacity-50">×</button></div><div className="relative mt-6 h-72 overflow-hidden rounded-3xl bg-[#2e2a28] sm:h-80"><Cropper image={cropSource} crop={crop} zoom={zoom} aspect={1} cropShape="round" showGrid={false} onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={(_, croppedPixels) => setCropAreaPixels(croppedPixels)}/></div><label className="mt-5 flex items-center gap-4 text-sm font-semibold text-[#776e68]"><span>縮放</span><input aria-label="頭像縮放" type="range" min={1} max={3} step={0.05} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} className="h-2 flex-1 accent-[#e98a7a]"/><span className="w-10 text-right text-xs text-[#a79b91]">{zoom.toFixed(1)}x</span></label><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={closeCrop} disabled={uploading} className="rounded-2xl border border-[#eaded4] px-5 py-3 text-sm font-bold text-[#776e68] transition hover:border-[#d9a59a] hover:bg-[#faf0e8] disabled:opacity-50">取消</button><button type="button" onClick={() => void confirmCrop()} disabled={uploading} className="rounded-2xl bg-[#e98a7a] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#d97568] disabled:cursor-wait disabled:opacity-60">{uploading ? '處理中⋯' : '確認套用'}</button></div></div></div>}
    </div>
  )
}
