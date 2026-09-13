import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Barcode, Bell, Boxes, CalendarDays, ClipboardList, Eye, EyeOff, LogOut, Minus, Moon, Plus, Search, Settings, Sun, Trash2, X } from 'lucide-react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { supabase, configured } from './supabase'
import { enableNotifications } from './notifications'

const emptyProduct = {
  name:'',
  barcode:'',
  category:'',
  unit:'adet',
  notes:'',
  min_stock:0,
  box_size:1
}
const emptyBatch = {
  lot_no:'',
  expiry_date:'',
  quantity:1,
  box_count:1,
  status:'closed'
}
const daysLeft = d => {
  if(!d) return Infinity
  const today=new Date()
  today.setHours(0,0,0,0)
  const expiry=new Date(d+'T00:00:00')
  return Math.round((expiry.getTime()-today.getTime())/86400000)
}
const fmt = d => d ? new Intl.DateTimeFormat('tr-TR').format(new Date(d+'T12:00:00')) : '-'

export default function App(){
  const [session,setSession]=useState(null), [loading,setLoading]=useState(true)
  const [showSplash,setShowSplash]=useState(true)
  const [darkMode,setDarkMode]=useState(()=>{
    const saved=localStorage.getItem('okan-sah-theme')
    if(saved) return saved==='dark'
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches || false
  })
  const [settingsTab,setSettingsTab]=useState('general')
  const [recentProducts,setRecentProducts]=useState(()=>{
    try{return JSON.parse(localStorage.getItem('okan-sah-recent-products') || '[]')}catch{return []}
  })
  const [needFavorites,setNeedFavorites]=useState(()=>{
    try{return JSON.parse(localStorage.getItem('okan-sah-need-favorites') || '[]')}catch{return []}
  })
  const [offlineQueue,setOfflineQueue]=useState(()=>{
    try{return JSON.parse(localStorage.getItem('okan-sah-offline-queue') || '[]')}catch{return []}
  })
  const [quickScanAfterSave,setQuickScanAfterSave]=useState(false)
  const [tab,setTab]=useState(new URLSearchParams(location.search).get('tab') || 'home')
  const [products,setProducts]=useState([]), [batches,setBatches]=useState([]), [query,setQuery]=useState('')
  const [login,setLogin]=useState({email:'',password:''}), [loginError,setLoginError]=useState('')
  const [modal,setModal]=useState(null), [productForm,setProductForm]=useState(emptyProduct), [batchForm,setBatchForm]=useState(emptyBatch)
  const [selectedBranch,setSelectedBranch]=useState(null)
  const [productBranch,setProductBranch]=useState(null)
  const [needs,setNeeds]=useState([])
  const [profile,setProfile]=useState(null)
  const [allowedUsers,setAllowedUsers]=useState([])
  const [userForm,setUserForm]=useState({
  email:'',
  role:'branch',
  branch:'suna_uzal'
})
const [needForm,setNeedForm]=useState({
  item_name:'',
  quantity:1,
  unit:'adet',
  note:''
})
  const [message,setMessage]=useState(''), [scanner,setScanner]=useState(false), [scanMode,setScanMode]=useState('find')
  const videoRef=useRef(null), scannerControls=useRef(null)
  const syncingOffline=useRef(false)
  const swipeStartX=useRef(null)
const swipeStartY=useRef(null)
  useEffect(()=>{
    // index.html only uses startup-dark while React is loading.
    // Once the app is mounted, the selected app theme must be the single source of truth.
    document.documentElement.classList.remove('startup-dark')
    document.documentElement.classList.toggle('dark',darkMode)
    localStorage.setItem('okan-sah-theme',darkMode ? 'dark' : 'light')

    const themeMeta=document.querySelector('meta[name="theme-color"]')
    if(themeMeta){
      themeMeta.setAttribute('content',darkMode ? '#080d18' : '#f8fafc')
    }
  },[darkMode])

  useEffect(()=>{
    localStorage.setItem('okan-sah-recent-products',JSON.stringify(recentProducts))
  },[recentProducts])

  useEffect(()=>{
    localStorage.setItem('okan-sah-need-favorites',JSON.stringify(needFavorites))
  },[needFavorites])

  useEffect(()=>{
    localStorage.setItem('okan-sah-offline-queue',JSON.stringify(offlineQueue))
  },[offlineQueue])

  useEffect(()=>{
    if(!session) return
    const sync=()=>syncOfflineQueue()
    window.addEventListener('online',sync)
    if(navigator.onLine && offlineQueue.length) sync()
    return ()=>window.removeEventListener('online',sync)
  },[session,offlineQueue])

  useEffect(()=>{
  function onTouchStart(e){
    if(e.touches.length!==1) return

    const touch=e.touches[0]

    // Sadece ekranın sol kenarından başlayan hareket
    if(touch.clientX>35) return

    swipeStartX.current=touch.clientX
    swipeStartY.current=touch.clientY
  }

  function onTouchEnd(e){
    if(swipeStartX.current===null) return

    const touch=e.changedTouches[0]

    const diffX=touch.clientX-swipeStartX.current
    const diffY=Math.abs(touch.clientY-swipeStartY.current)

    swipeStartX.current=null
    swipeStartY.current=null

    // Yeterince sağa kaydırılmadıysa veya dikey hareket fazlaysa iptal
    if(diffX<80 || diffY>70) return

    if(scanner){
      scannerControls.current?.stop()
      setScanner(false)
      return
    }

    if(modal){
      setModal(null)
      return
    }

    if(tab==='products' && profile?.role==='admin' && productBranch){
      setProductBranch(null)
      return
    }

    if(tab==='needs' && profile?.role==='admin' && selectedBranch){
      setSelectedBranch(null)
      return
    }

    if(profile?.role==='admin' && tab!=='home'){
      setTab('home')
    }
  }

  window.addEventListener('touchstart',onTouchStart,{passive:true})
  window.addEventListener('touchend',onTouchEnd,{passive:true})

  return ()=>{
    window.removeEventListener('touchstart',onTouchStart)
    window.removeEventListener('touchend',onTouchEnd)
  }
},[scanner,modal,tab,profile,productBranch,selectedBranch])

  useEffect(()=>{
    if(!configured){ setLoading(false); return }
    supabase.auth.getSession().then(({data})=>{setSession(data.session);setLoading(false)})
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s))
    return ()=>subscription.unsubscribe()
  },[])
useEffect(()=>{
  if(loading) return

  const startedAt=window.__STOKCEP_START__ || Date.now()
  const elapsed=Date.now()-startedAt
  const remaining=Math.max(0,2300-elapsed)

  const timer=setTimeout(()=>{
    setShowSplash(false)
  },remaining)

  return ()=>clearTimeout(timer)
},[loading])
  useEffect(()=>{ if(session) loadData() },[session])
  useEffect(()=>()=>scannerControls.current?.stop(),[])
async function loadData(){
  const [
    {data:p,error:pe},
    {data:b,error:be},
    {data:n,error:ne},
    {data:pr,error:pre}
  ] = await Promise.all([
    supabase.from('products').select('*').order('name'),
    supabase.from('batches').select('*,products(name,barcode,unit,box_size)').order('expiry_date'),
    supabase.from('branch_needs').select('*').order('created_at',{ascending:false}),
    supabase.from('user_profiles').select('*').eq('user_id',session.user.id).single()
  ])

  if(pe||be||ne||pre){
    try{
      const cached=JSON.parse(localStorage.getItem('okan-sah-data-cache') || 'null')
      if(cached){
        setProducts(cached.products || [])
        setBatches(cached.batches || [])
        setNeeds(cached.needs || [])
        setProfile(cached.profile || null)
        flash('Çevrimdışısın. Son kayıtlı veriler gösteriliyor.')
        return
      }
    }catch{}
    return flash((pe||be||ne||pre).message)
  }

  setProducts(p||[])
  setBatches(b||[])
  setNeeds(n||[])
  setProfile(pr||null)
  localStorage.setItem('okan-sah-data-cache',JSON.stringify({
    products:p||[],
    batches:b||[],
    needs:n||[],
    profile:pr||null
  }))

  if(pr?.role==='admin'){
    const {data:au,error:aue}=await supabase
      .from('allowed_users')
      .select('*')
      .order('email')

    if(aue) return flash(aue.message)

    setAllowedUsers(au||[])
  }else{
    setAllowedUsers([])
  }

  if(pr?.role==='branch' && pr?.branch){
    setSelectedBranch(pr.branch)
    setTab(current=>current==='home' ? 'needs' : current)
  }
}
function addOfflineAction(type,payload){
  const action={
    id:`${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type,
    payload,
    created_at:new Date().toISOString()
  }
  setOfflineQueue(prev=>[...prev,action])
  return action
}

async function syncOfflineQueue(){
  if(syncingOffline.current || !navigator.onLine || !session || !offlineQueue.length) return
  syncingOffline.current=true

  let remaining=[...offlineQueue]
  let completed=0

  try{
    for(const action of offlineQueue){
      let error=null

      if(action.type==='addNeed'){
        const result=await supabase.from('branch_needs').insert(action.payload)
        error=result.error
      }else if(action.type==='mergeNeed'){
        const {data:current,error:readError}=await supabase
          .from('branch_needs')
          .select('quantity,note')
          .eq('id',action.payload.id)
          .maybeSingle()

        if(readError){
          error=readError
        }else if(current){
          const notes=[current.note,action.payload.note]
            .map(v=>(v || '').trim())
            .filter(Boolean)
          const mergedNote=[...new Set(notes)].join(' • ') || null

          const result=await supabase
            .from('branch_needs')
            .update({
              quantity:Number(current.quantity || 0)+Number(action.payload.delta || 0),
              note:mergedNote
            })
            .eq('id',action.payload.id)

          error=result.error
        }
      }else if(action.type==='addBatch'){
        const result=await supabase.from('batches').insert(action.payload)
        error=result.error
      }

      if(error) break

      remaining=remaining.filter(x=>x.id!==action.id)
      completed++
    }

    if(completed){
      setOfflineQueue(remaining)
      await loadData()
      flash(`${completed} çevrimdışı işlem senkronlandı.`)
    }
  }finally{
    syncingOffline.current=false
  }
}

function rememberRecentProduct(p){
  if(!p?.id) return
  setRecentProducts(prev=>[p.id,...prev.filter(id=>id!==p.id)].slice(0,8))
}

function toggleNeedFavorite(){
  const name=needForm.item_name.trim()
  const unit=needForm.unit.trim() || 'adet'
  if(!name) return flash('Önce ürün adı yazmalısın.')

  const key=name.toLocaleLowerCase('tr-TR')+'__'+unit.toLocaleLowerCase('tr-TR')
  const exists=needFavorites.some(f=>f.key===key)

  if(exists){
    setNeedFavorites(prev=>prev.filter(f=>f.key!==key))
    flash('Sık kullanılanlardan çıkarıldı.')
  }else{
    setNeedFavorites(prev=>[{key,name,unit},...prev].slice(0,16))
    flash('Sık kullanılanlara eklendi.')
  }
}

function useNeedFavorite(f){
  setNeedForm(prev=>({...prev,item_name:f.name,unit:f.unit || 'adet'}))
}

async function addAllowedUser(e){
  e.preventDefault()

  const email=userForm.email.trim().toLowerCase()

  if(!email) return flash('E-posta adresi yazmalısın.')

  const branch=userForm.role==='admin' ? null : userForm.branch

  const {error}=await supabase
    .from('allowed_users')
    .insert({
      email,
      role:userForm.role,
      branch
    })

  if(error) return flash(error.message)

  setUserForm({
    email:'',
    role:'branch',
    branch:'suna_uzal'
  })

  flash('Kullanıcı yetkisi eklendi.')
  loadData()
}

async function updateAllowedUser(email,role,branch){
  const finalBranch=role==='admin' ? null : branch

  const {error}=await supabase
    .from('allowed_users')
    .update({
      role,
      branch:finalBranch
    })
    .eq('email',email)

  if(error) return flash(error.message)

  flash('Kullanıcı yetkisi güncellendi.')
  loadData()
}

async function removeAllowedUser(email){
  const ok=confirm(`${email} için uygulama erişimi kaldırılsın mı?`)
  if(!ok) return

  if(email.toLowerCase()===session.user.email?.toLowerCase()){
    return flash('Kendi erişimini kaldıramazsın.')
  }

  const {error}=await supabase
    .from('allowed_users')
    .delete()
    .eq('email',email)

  if(error) return flash(error.message)

  flash('Kullanıcının erişimi kaldırıldı.')
  loadData()
}
async function addNeed(e){
  e.preventDefault()

  if(!selectedBranch) return

  const itemName=needForm.item_name.trim().replace(/\s+/g,' ')
  const unit=(needForm.unit.trim() || 'adet').replace(/\s+/g,' ')
  const quantity=Number(needForm.quantity)
  const note=needForm.note?.trim() || null
  const normalize=value=>(value || '')
    .trim()
    .replace(/\s+/g,' ')
    .toLocaleLowerCase('tr-TR')
  const combineNotes=(oldNote,newNote)=>{
    const notes=[oldNote,newNote]
      .map(v=>(v || '').trim())
      .filter(Boolean)
    return [...new Set(notes)].join(' • ') || null
  }
  const resetForm=()=>setNeedForm({item_name:'',quantity:1,unit:'adet',note:''})

  if(!itemName) return flash('Ürün adı yazmalısın.')
  if(!quantity || quantity<=0) return flash('Adet 1 veya daha fazla olmalı.')

  const payload={
    branch:selectedBranch,
    item_name:itemName,
    quantity,
    unit,
    note
  }

  // Henüz sunucuya gitmemiş aynı çevrimdışı kayıt varsa onu büyüt.
  const localExisting=needs.find(n=>
    n.branch===selectedBranch &&
    !n.completed &&
    !n.picked_up &&
    !n.delivered &&
    normalize(n.item_name)===normalize(itemName) &&
    normalize(n.unit || 'adet')===normalize(unit)
  )

  if(localExisting && String(localExisting.id).startsWith('offline-')){
    const nextQty=Number(localExisting.quantity || 0)+quantity
    const mergedNote=combineNotes(localExisting.note,note)

    setOfflineQueue(prev=>prev.map(action=>{
      if(action.type!=='addNeed') return action
      const p=action.payload || {}
      const same=
        p.branch===selectedBranch &&
        normalize(p.item_name)===normalize(itemName) &&
        normalize(p.unit || 'adet')===normalize(unit)

      return same
        ? {...action,payload:{...p,quantity:Number(p.quantity || 0)+quantity,note:mergedNote}}
        : action
    }))

    setNeeds(prev=>prev.map(n=>
      n.id===localExisting.id
        ? {...n,quantity:nextQty,note:mergedNote}
        : n
    ))

    resetForm()
    return flash(`Aynı ihtiyaç birleştirildi. Toplam ${nextQty} ${unit}.`)
  }

  if(!navigator.onLine){
    if(localExisting){
      const nextQty=Number(localExisting.quantity || 0)+quantity
      const mergedNote=combineNotes(localExisting.note,note)

      addOfflineAction('mergeNeed',{
        id:localExisting.id,
        delta:quantity,
        note
      })

      setNeeds(prev=>prev.map(n=>
        n.id===localExisting.id
          ? {...n,quantity:nextQty,note:mergedNote}
          : n
      ))

      resetForm()
      return flash(`Aynı ihtiyaç birleştirildi. Toplam ${nextQty} ${unit}; internet gelince gönderilecek.`)
    }

    const offlineId=`offline-${Date.now()}`
    addOfflineAction('addNeed',payload)
    setNeeds(prev=>[{
      id:offlineId,
      ...payload,
      created_at:new Date().toISOString(),
      picked_up:false,
      delivered:false,
      completed:false
    },...prev])

    resetForm()
    return flash('İnternet yok. İhtiyaç kaydedildi; bağlantı gelince gönderilecek.')
  }

  // Sunucudaki güncel listeyi kontrol et; aynı aktif ihtiyaç varsa yeni satır açma.
  const {data:branchRows,error:findError}=await supabase
    .from('branch_needs')
    .select('id,item_name,quantity,unit,note,picked_up,delivered,completed')
    .eq('branch',selectedBranch)

  if(findError) return flash(findError.message)

  const existing=(branchRows || []).find(n=>
    !n.completed &&
    !n.picked_up &&
    !n.delivered &&
    normalize(n.item_name)===normalize(itemName) &&
    normalize(n.unit || 'adet')===normalize(unit)
  )

  if(existing){
    const nextQty=Number(existing.quantity || 0)+quantity
    const mergedNote=combineNotes(existing.note,note)

    const {error:updateError}=await supabase
      .from('branch_needs')
      .update({
        quantity:nextQty,
        note:mergedNote
      })
      .eq('id',existing.id)

    if(updateError) return flash(updateError.message)

    resetForm()
    flash(`Aynı ihtiyaç birleştirildi. Toplam ${nextQty} ${unit}.`)
    loadData()
    return
  }

  const {error}=await supabase
    .from('branch_needs')
    .insert(payload)

  if(error) return flash(error.message)

  resetForm()
  flash('İhtiyaç eklendi.')
  loadData()
}

  async function partialNeed(id,currentQty){
  const value = prompt(`Kaç adet teslim edildi? Mevcut ihtiyaç: ${currentQty}`)
  if(value===null) return

  const delivered = Number(value)

  if(!delivered || delivered <= 0){
    return flash('Geçerli bir miktar gir.')
  }

  if(delivered >= Number(currentQty)){
    return completeNeed(id)
  }

  const remaining = Number(currentQty) - delivered

  const {error}=await supabase
    .from('branch_needs')
    .update({quantity:remaining})
    .eq('id',id)

  if(error) return flash(error.message)

  flash(`Teslim kaydedildi. Kalan: ${remaining}`)
  loadData()
}
async function markGroupPickedUp(ids){
  const ok=confirm('Bu ürün depodan alındı olarak işaretlensin mi?')
  if(!ok) return

  const {error}=await supabase
    .from('branch_needs')
    .update({
      picked_up:true,
      picked_up_at:new Date().toISOString()
    })
    .in('id',ids)

  if(error) return flash(error.message)

  flash('Depodan alındı olarak işaretlendi.')
  loadData()
}
  async function markNeedDelivered(ids){
  const ok=confirm('Bu ürün ilgili kantine teslim edildi mi?')
  if(!ok) return

  const {error}=await supabase
    .from('branch_needs')
    .update({
      delivered:true,
      delivered_at:new Date().toISOString()
    })
    .in('id',ids)

  if(error) return flash(error.message)

  flash('Teslim edildi olarak işaretlendi.')
  loadData()
}
  async function completeNeed(id){
  const ok=confirm('Bu ürün alındı olarak işaretlensin mi?')
  if(!ok) return

  const {error}=await supabase
    .from('branch_needs')
    .update({
      completed:true,
      completed_at:new Date().toISOString()
    })
    .eq('id',id)

  if(error) return flash(error.message)

  flash('✓ Alındı olarak işaretlendi.')
  loadData()
}
  async function deleteNeed(id){
  const ok = confirm('Bu ihtiyaç listeden silinsin mi?')
  if(!ok) return

  const {error}=await supabase
    .from('branch_needs')
    .delete()
    .eq('id',id)

  if(error) return flash(error.message)

  flash('İhtiyaç listeden silindi.')
  loadData()
}
  async function finishNeedsList(){
  if(!selectedBranch)
    return flash('Önce şube seçmelisin.')

  const branchNeeds=needs.filter(n=>n.branch===selectedBranch)

  if(!branchNeeds.length)
    return flash('Liste zaten boş.')

  const unfinished=branchNeeds.filter(n=>!n.completed)

  const text=unfinished.length
    ? `Listede ${unfinished.length} alınmamış ürün var. Yine de listeyi bitirip tamamını silmek istiyor musun?`
    : 'Tüm ürünler alındı. Liste bitirilip temizlensin mi?'

  if(!confirm(text)) return

  const {error}=await supabase
    .from('branch_needs')
    .delete()
    .eq('branch',selectedBranch)

  if(error) return flash(error.message)

  flash('Liste tamamlandı ve temizlendi.')
  loadData()
}
async function sendNeedsList(){
  if(!selectedBranch) return

  const count = needs.filter(n=>n.branch===selectedBranch).length

  if(count===0){
    return flash('Gönderilecek ihtiyaç yok.')
  }

  try{
    const {data,error}=await supabase.functions.invoke(
      'send-needs-notification',
      {
        body:{
          branch:selectedBranch
        }
      }
    )

    if(error) throw error

    flash(`Liste yöneticilere gönderildi. ${data?.sent ?? 0} cihaza bildirim gitti.`)
  }catch(e){
    flash(`Bildirim hatası: ${e.message}`)
  }
}
function flash(t){
  setMessage(t)
  setTimeout(()=>setMessage(''),3500)
}
  async function signIn(e){
    e.preventDefault(); setLoginError('')
    const {error}=await supabase.auth.signInWithPassword(login)
    if(error)setLoginError('E-posta veya şifre hatalı.')
  }async function signUp(email,password){
  const {data,error}=await supabase.auth.signUp({
    email,
    password
  })

  if(error) throw error

  return data
}
  async function signOut(){ await supabase.auth.signOut() }

  const totals=useMemo(()=>{
    const qty=batches.reduce((a,b)=>a+Number(b.quantity||0),0)
    const near=batches.filter(b=>daysLeft(b.expiry_date)>=0&&daysLeft(b.expiry_date)<=10).length
    const expired=batches.filter(b=>daysLeft(b.expiry_date)<0).length
    return {qty,near,expired}
  },[batches])
 const productQty=id=>batches
  .filter(b=>
    b.product_id===id &&
    b.branch===(profile?.role==='branch' ? profile.branch : productBranch)
  )
  .reduce((a,b)=>a+Number(b.quantity||0),0)
  const filtered=products.filter(p=>(p.name+' '+(p.barcode||'')+' '+(p.category||'')).toLowerCase().includes(query.toLowerCase()))
  const recentProductRows=recentProducts.map(id=>products.find(p=>p.id===id)).filter(Boolean)
  const needSuggestions=[...new Set([
    ...needFavorites.map(f=>f.name),
    ...products.map(p=>p.name),
    ...needs.map(n=>n.item_name)
  ].filter(Boolean))]
    .filter(name=>{
      const q=needForm.item_name.trim().toLocaleLowerCase('tr-TR')
      return q && name.toLocaleLowerCase('tr-TR').includes(q) && name.toLocaleLowerCase('tr-TR')!==q
    })
    .slice(0,6)

  function openNew(barcode=''){
    setQuickScanAfterSave(false)

    if(profile?.role==='admin' && !productBranch){
      const choice=prompt(
        'Hangi kantin için işlem yapılıyor?\n1 - Veteriner Fakültesi\n2 - İktisat Fakültesi\n3 - Suna UZAL\n4 - USO'
      )
      const branchMap={'1':'veteriner','2':'iktisat','3':'suna_uzal','4':'uso'}
      const branch=branchMap[choice]
      if(!branch) return flash('Kantin seçilmedi.')
      setProductBranch(branch)
    }

    setProductForm({...emptyProduct,barcode})
    setBatchForm(emptyBatch)
    setModal('new')
  }
  function openProduct(p,quick=false){
    setQuickScanAfterSave(Boolean(quick))
    if(profile?.role==='admin' && !productBranch){
      const choice=prompt(
        'Hangi kantin için işlem yapılıyor?\n1 - Veteriner Fakültesi\n2 - İktisat Fakültesi\n3 - Suna UZAL\n4 - USO'
      )
      const branchMap={
        '1':'veteriner',
        '2':'iktisat',
        '3':'suna_uzal',
        '4':'uso'
      }
      const branch=branchMap[choice]
      if(!branch) return flash('Kantin seçilmedi.')
      setProductBranch(branch)
    }

    setProductForm({...p})
    setBatchForm(emptyBatch)
    setModal('product')
  }
async function saveNew(e){
  e.preventDefault()

  if(!productForm.name.trim())
    return flash('Ürün adı gerekli.')

  const branch =
    profile?.role==='branch'
      ? profile.branch
      : productBranch

  if(!branch)
    return flash('Önce üniversite seçmelisin.')
  let p=null

const barcode=productForm.barcode?.trim() || null

if(barcode){
  const {data:existing,error:findError}=await supabase
    .from('products')
    .select('*')
    .eq('barcode',barcode)
    .maybeSingle()

  if(findError) return flash(findError.message)

 if(existing){
  p=existing

  if(
    productForm.unit==='kutu' &&
    Number(productForm.box_size)>0 &&
    Number(existing.box_size)!==Number(productForm.box_size)
  ){
    const {data:updated,error:updateError}=await supabase
      .from('products')
      .update({
        box_size:Number(productForm.box_size)
      })
      .eq('id',existing.id)
      .select()
      .single()

    if(updateError) return flash(updateError.message)

    p=updated
  }
}
}

if(!p){
  const {data:newProduct,error:productError}=await supabase
    .from('products')
   .insert({
  ...productForm,
  barcode,
  unit:'adet',
  created_by:session.user.id
})
    .select()
    .single()

  if(productError) return flash(productError.message)

  p=newProduct
}
  const enteredQty=Number(batchForm.quantity)
const boxSize=Number(productForm.box_size || p.box_size || 1)

const stockQty=
  productForm.unit==='kutu'
    ? enteredQty * boxSize
    : enteredQty
  let be=null

  if(productForm.unit==='kutu'){
    const rows=Array.from({length:enteredQty},()=>({
      product_id:p.id,
      branch,
      expiry_date:batchForm.expiry_date,
      quantity:boxSize,
      box_count:1,
      status:'closed'
    }))

    const result=await supabase
      .from('batches')
      .insert(rows)

    be=result.error
  }else{
    const result=await supabase
      .from('batches')
      .insert({
        product_id:p.id,
        branch,
        expiry_date:batchForm.expiry_date,
        quantity:stockQty,
        box_count:1,
        status:'closed'
      })

    be=result.error
  }

  if(be) return flash(be.message)

  setModal(null)
  await loadData()
  flash('Ürün stoğa eklendi.')
}
  async function updateProduct(e){
    e.preventDefault()
    const {error}=await supabase.from('products').update({name:productForm.name,barcode:productForm.barcode||null,category:productForm.category,unit:productForm.unit,notes:productForm.notes,min_stock:Number(productForm.min_stock||0),box_size:Number(productForm.box_size||1)}).eq('id',productForm.id)
    if(error)return flash(error.message)
    setModal(null);await loadData();flash('Ürün güncellendi.')
  }
 async function addBatch(e){
  e.preventDefault()

  if(!batchForm.expiry_date)
    return flash('Son kullanma tarihi gerekli.')

  const branch =
    profile?.role === 'branch'
      ? profile.branch
      : productBranch

  if(!branch)
    return flash('Şube belirlenemedi.')

  const isBox=Number(productForm.box_size)>1
  let payload

  if(isBox){
    const boxCount=Math.max(1,Number(batchForm.box_count || 1))
    payload=Array.from({length:boxCount},()=>({
      product_id:productForm.id,
      branch,
      expiry_date:batchForm.expiry_date,
      quantity:Number(productForm.box_size || 1),
      box_count:1,
      status:'closed'
    }))
  }else{
    payload={
      product_id:productForm.id,
      branch,
      expiry_date:batchForm.expiry_date,
      quantity:Number(batchForm.quantity),
      box_count:1,
      status:'closed'
    }
  }

  if(!navigator.onLine){
    addOfflineAction('addBatch',payload)
    const optimistic=(Array.isArray(payload) ? payload : [payload]).map((row,i)=>({
      id:`offline-batch-${Date.now()}-${i}`,
      ...row,
      products:{
        name:productForm.name,
        barcode:productForm.barcode,
        unit:productForm.unit,
        box_size:productForm.box_size
      }
    }))
    setBatches(prev=>[...prev,...optimistic])
    setBatchForm(emptyBatch)
    flash('İnternet yok. Parti kaydedildi; bağlantı gelince gönderilecek.')

    if(quickScanAfterSave){
      setModal(null)
      setTimeout(()=>startScanner('quick'),250)
    }
    return
  }

  const {error}=await supabase
    .from('batches')
    .insert(payload)

  if(error) return flash(error.message)

  const boxCount=Array.isArray(payload) ? payload.length : 1
  setBatchForm(emptyBatch)
  await loadData()
  flash(isBox ? `${boxCount} kutu eklendi.` : 'Parti eklendi.')

  if(quickScanAfterSave){
    setModal(null)
    setTimeout(()=>startScanner('quick'),250)
  }
}
  async function changeQty(batch,delta){
    const next=Math.max(0,Number(batch.quantity)+delta)
    const {error}=await supabase.rpc('change_batch_quantity',{p_batch_id:batch.id,p_delta:delta,p_user_id:session.user.id})
    if(error) return flash(error.message)
    if(next===0) flash('Parti stoğu 0 oldu.'); await loadData()
  }
  async function openBatch(batch){
    const earlier=batches
      .filter(b=>
        b.id!==batch.id &&
        b.product_id===batch.product_id &&
        b.branch===batch.branch &&
        b.status==='closed' &&
        b.expiry_date<batch.expiry_date
      )
      .sort((a,b)=>a.expiry_date.localeCompare(b.expiry_date))

    if(earlier.length){
      const ok=confirm(
        `Daha erken SKT'li kapalı kutu var (${fmt(earlier[0].expiry_date)}). Yine de bu kutuyu açmak istiyor musun?`
      )
      if(!ok) return
    }

    const {error}=await supabase
      .from('batches')
      .update({
        status:'open',
        opened_at:new Date().toISOString()
      })
      .eq('id',batch.id)

    if(error) return flash(error.message)

    await loadData()
    flash('Kutu açık olarak işaretlendi.')
  }

  async function deleteBatch(id){
    if(!confirm('Bu kutu / parti bitti mi? Kayıt listeden kaldırılacak.'))return
    const {error}=await supabase.from('batches').delete().eq('id',id); if(error)return flash(error.message)
    await loadData();flash('Parti silindi.')
  }
  async function deleteProduct(id){
    if(!confirm('Ürünü ve tüm parti kayıtlarını silmek istiyor musun?'))return
    const {error}=await supabase.from('products').delete().eq('id',id); if(error)return flash(error.message)
    setModal(null);await loadData();flash('Ürün silindi.')
  }

  async function startScanner(mode='find'){
  setScanMode(mode)
  setScanner(true)

  setTimeout(async()=>{
    try{
      const reader=new BrowserMultiFormatReader()

      scannerControls.current=await reader.decodeFromConstraints(
        {
          video:{
            facingMode:{ideal:'environment'},
            width:{ideal:1920},
            height:{ideal:1080}
          }
        },
        videoRef.current,
        (result)=>{
          if(result){
            scannerControls.current?.stop()
            setScanner(false)
            handleBarcode(result.getText(),mode)
          }
        }
      )

      // iPhone destekliyorsa sürekli autofocus + hafif zoom
      const stream=videoRef.current?.srcObject
      const track=stream?.getVideoTracks?.()[0]

      if(track){
        const caps=track.getCapabilities?.() || {}
        const advanced={}

        if(caps.focusMode?.includes?.('continuous')){
          advanced.focusMode='continuous'
        }

        if(caps.zoom){
          const min=caps.zoom.min ?? 1
          const max=caps.zoom.max ?? 1
          advanced.zoom=Math.min(max,Math.max(min,1.5))
        }

        if(Object.keys(advanced).length){
          try{
            await track.applyConstraints({advanced:[advanced]})
          }catch{}
        }
      }

    }catch(e){
      setScanner(false)
      flash('Kamera açılamadı. Kamera iznini kontrol et.')
    }
  },100)
}
 function handleBarcode(code,mode){
  const p=products.find(x=>x.barcode===code)

  if(mode==='quick'){
    if(p){
      rememberRecentProduct(p)
      openProduct(p,true)
    }else{
      setQuickScanAfterSave(false)
      flash('Bu barkod ilk kez görülüyor. Ürünü bir kez tanımlaman gerekiyor.')
      openNew(code)
    }
    return
  }

  if(mode==='new'){
    if(p){
      rememberRecentProduct(p)
      openProduct(p)
    }else{
      openNew(code)
    }
    return
  }

  if(p){
    rememberRecentProduct(p)
    openProduct(p)
  }else if(confirm('Bu barkod kayıtlı değil. Yeni ürün olarak eklemek ister misin?')){
    openNew(code)
  }
}
  async function notify(){
    try{await enableNotifications(session.user.id);flash('Bildirimler açıldı.')}catch(e){flash(e.message)}
  }async function testNotification(){
  try{
    const {data,error}=await supabase.functions.invoke(
      'send-expiry-notifications',
      {body:{test:true}}
    )

    if(error) throw error

    flash(`Test bildirimi gönderildi. ${data?.sent ?? 0} cihaza gönderildi.`)
  }catch(e){
    flash(`Test bildirimi hatası: ${e.message}`)
  }
}
if(showSplash) return (
  <div
    style={{
      minHeight:'100vh',
      display:'flex',
      flexDirection:'column',
      alignItems:'center',
      justifyContent:'center',
      background:darkMode ? '#080d18' : '#f8fafc',
color:darkMode ? '#f8fafc' : '#0f172a',
      textAlign:'center',
      padding:'24px',
paddingBottom:'180px',
    }}
  >
    <img
      src="/icon.svg"
      alt="Okan-Şah Gıda"
      style={{
        width:'90px',
        height:'90px',
        marginBottom:'24px'
      }}
    />

    <h1
      style={{
        fontSize:'34px',
        margin:'0 0 8px'
      }}
    >
      Okan-Şah Gıda
    </h1>

    <p
      style={{
        margin:0,
        fontSize:'16px',
        opacity:.7
      }}
    >
      Stok ve Kantin Yönetimi
    </p>
  </div>
)
  if(loading) return <div className="center">Yükleniyor…</div>
  if(!configured) return <SetupMissing />
  if(!session) return <Login login={login} setLogin={setLogin} error={loginError} submit={signIn} signUp={signUp}/>

  const expiryList=[...batches].sort((a,b)=>a.expiry_date.localeCompare(b.expiry_date))

const expiryWarnings=batches
  .filter(b=>{
    // Çalışan sadece kendi şubesinin uyarısını görsün
    if(profile?.role==='branch' && b.branch!==profile.branch) return false

    const remaining=daysLeft(b.expiry_date)
    return remaining>=0 && remaining<=10
  })
  .map(b=>({...b,daysLeft:daysLeft(b.expiry_date)}))
  .sort((a,b)=>a.daysLeft-b.daysLeft)
  const branchLabels={
  veteriner:'Veteriner Fakültesi',
  iktisat:'İktisat Fakültesi',
  suna_uzal:'Suna UZAL',
  uso:'USO'
}

const groupedNeeds=Object.values(
  needs.reduce((acc,n)=>{
    const item=(n.item_name || '').trim()
    const unit=(n.unit || 'adet').trim()
    const key=`${item.toLocaleLowerCase('tr-TR')}__${unit.toLocaleLowerCase('tr-TR')}`

    if(!acc[key]){
      acc[key]={
        key,
        item_name:item,
        unit,
        total:0,
        branches:{},
        branchRows:{},
        ids:[],
        allPickedUp:true
      }
    }

    const qty=Number(n.quantity) || 0

    acc[key].total+=qty
    acc[key].branches[n.branch]=(acc[key].branches[n.branch] || 0)+qty
    if(!acc[key].branchRows[n.branch]){
  acc[key].branchRows[n.branch]=[]
}

acc[key].branchRows[n.branch].push(n)
    acc[key].ids.push(n.id)

    if(!n.picked_up){
      acc[key].allPickedUp=false
    }

    return acc
  },{})
).filter(g=>
  Object.values(g.branchRows).some(rows=>
    rows.some(r=>!r.delivered)
  )
)

const branchNeedCounts=Object.keys(branchLabels).reduce((acc,branch)=>{
  acc[branch]=needs.filter(n=>n.branch===branch && !n.completed).length
  return acc
},{})
const totalPendingNeeds=Object.values(branchNeedCounts).reduce((sum,count)=>sum+count,0)
const branchesWithNeeds=Object.values(branchNeedCounts).filter(count=>count>0).length

const dashboard={
  urgent3:batches.filter(b=>daysLeft(b.expiry_date)>=0 && daysLeft(b.expiry_date)<=3).length,
  near10:batches.filter(b=>daysLeft(b.expiry_date)>=0 && daysLeft(b.expiry_date)<=10).length,
  expired:batches.filter(b=>daysLeft(b.expiry_date)<0).length,
  openBoxes:batches.filter(b=>b.status==='open').length
}
  return <div className="app">
    <header><div className="topBrand">
  <img src="/icon.svg" alt="Okan-Şah Gıda" />

  <div>
    <b>Okan-Şah Gıda</b>
    <small>Kantin & Stok Yönetimi</small>
  </div>
</div> <button className="icon" onClick={signOut}> <LogOut size={20}/></button></header>
   {tab==='home' && expiryWarnings.length>0 && (
  <div className="card homeAlertCard">
    <h3>⚠️ SKT Uyarıları</h3>

    <div className="list">
      {expiryWarnings.map(b=>(
        <div className="productRow" key={b.id}>
          <div>
            <b>{b.products?.name || 'Ürün'}</b>

            <small>
              {daysLeft(b.expiry_date)<=3
                ? `🚨 SKT'ye ${daysLeft(b.expiry_date)} gün kaldı`
                : `⚠️ SKT'ye ${daysLeft(b.expiry_date)} gün kaldı`}
            </small>

            <small>
              {b.expiry_date}
            </small>
          </div>

          <button
            type="button"
            onClick={()=>deleteBatch(b.id)}
          >
            Toplandı
          </button>
        </div>
      ))}
    </div>
  </div>
)}
    {offlineQueue.length>0 && (
      <div className="offlineBanner">
        <b>Çevrimdışı kayıtlar bekliyor</b>
        <span>{offlineQueue.length} işlem bağlantı gelince otomatik gönderilecek.</span>
      </div>
    )}
    <main>
      {tab==='home' && <>
        <section className="hero">
          <h1>Stokların kontrol altında.</h1>
          <p>Mal kabulünde hızlı giriş kullan; barkodu okutunca doğrudan SKT ekranı açılsın.</p>
          <div className="heroActions">
            <button onClick={()=>startScanner('quick')}><Barcode size={20}/> Hızlı Mal Girişi</button>
            <button className="heroSecondary" onClick={()=>startScanner('find')}><Search size={19}/> Barkod Ara</button>
          </div>
        </section>

        <div className="stats quickStats">
          <Stat n={dashboard.urgent3} t="3 gün içinde" danger/>
          <Stat n={dashboard.near10} t="10 gün içinde" warn/>
          <Stat n={dashboard.expired} t="Süresi geçen" danger/>
          <Stat n={dashboard.openBoxes} t="Açık kutu"/>
        </div>

        {recentProductRows.length>0 && <>
          <div className="sectionTitle"><h2>Son Okutulanlar</h2></div>
          <div className="recentGrid">
            {recentProductRows.slice(0,6).map(p=>(
              <button key={p.id} className="recentItem" onClick={()=>openProduct(p)}>
                <b>{p.name}</b>
                <small>{p.barcode || 'Barkod yok'}</small>
              </button>
            ))}
          </div>
        </>}

        <div className="sectionTitle"><h2>Yaklaşan tarihler</h2><button className="link" onClick={()=>setTab('expiry')}>Tümünü gör</button></div>
        <div className="list">{expiryList.slice(0,5).map(b=><BatchRow key={b.id} b={b}/>)}{!expiryList.length&&<Empty text="Henüz parti kaydı yok."/>}</div>
      </>}
      {tab==='needs' && <>
 {profile?.role==='admin' && !selectedBranch ? <>
    <div className="sectionTitle">
      <h1>İhtiyaçlar</h1>
    </div>

    <div className={`needsOverview ${totalPendingNeeds ? 'hasNeeds' : ''}`}>
      <div>
        <b>{totalPendingNeeds ? `${branchesWithNeeds} kantinde ihtiyaç var` : 'Şu an bekleyen ihtiyaç yok'}</b>
        <small>
          {totalPendingNeeds
            ? `Toplam ${totalPendingNeeds} kalem bekliyor.`
            : 'Yeni ihtiyaç geldiğinde burada bildirim olarak görünecek.'}
        </small>
      </div>
      {totalPendingNeeds>0 && <span className="needsOverviewCount">{totalPendingNeeds}</span>}
    </div>

    <div className="list branchNeedList">
      {Object.entries(branchLabels).map(([branch,label])=>{
        const count=branchNeedCounts[branch] || 0
        return (
          <button
            key={branch}
            className={`productRow needBranchRow ${count ? 'hasNeeds' : ''}`}
            onClick={()=>setSelectedBranch(branch)}
          >
            <div>
              <b>{label}</b>
              <small>{count ? `${count} bekleyen ihtiyaç` : 'Şu an ihtiyaç yok'}</small>
            </div>
            <span className={`needStatusBadge ${count ? 'active' : ''}`}>
              {count ? 'İhtiyaç var' : 'Boş'}
            </span>
          </button>
        )
      })}
    </div>

    {groupedNeeds.length>0 && (
      <details className="depotDetails">
        <summary>
          <span>Depo Toplama Listesi</span>
          <small>{groupedNeeds.length} ürün</small>
        </summary>

        <div className="list depotNeedList">
          {groupedNeeds.map(g=>(
            <div className="productRow" key={g.key}>
              <div>
                <b>{g.item_name}</b>
                <small>Toplam: {g.total} {g.unit}</small>

                {Object.entries(g.branches).map(([branch,qty])=>{
                  const rows=g.branchRows[branch] || []
                  const allDelivered=rows.length>0 && rows.every(r=>r.delivered)

                  return (
                    <div className="depotBranchLine" key={branch}>
                      <small>{branchLabels[branch] || branch}: {qty} {g.unit}</small>
                      {g.allPickedUp && (
                        allDelivered ? (
                          <span className="miniDone">✓ Teslim edildi</span>
                        ) : (
                          <button type="button" className="secondary miniAction" onClick={()=>markNeedDelivered(rows.map(r=>r.id))}>
                            Teslim Ettim
                          </button>
                        )
                      )}
                    </div>
                  )
                })}
              </div>

              {g.allPickedUp ? (
                <button type="button" className="secondary" disabled>✓ Depodan Alındı</button>
              ) : (
                <button type="button" onClick={()=>markGroupPickedUp(g.ids)}>Depodan Aldım</button>
              )}
            </div>
          ))}
        </div>
      </details>
    )}
  </> : <>
    <div className="sectionTitle">
      <h1>
        {selectedBranch==='veteriner' ? 'Veteriner Fakültesi' :
         selectedBranch==='iktisat' ? 'İktisat Fakültesi' :
         selectedBranch==='suna_uzal' ? 'Suna UZAL' : 'USO'}
      </h1>

     {profile?.role==='admin' && (
  <button
    className="secondary"
    onClick={()=>setSelectedBranch(null)}
  >
    Geri
  </button>
)}
    </div>

    <div className="card">
  <h3>İhtiyaç Ekle</h3>

  {needFavorites.length>0 && (
    <div className="needFavorites">
      <small>Sık kullanılanlar</small>
      <div className="favoriteChips">
        {needFavorites.map(f=>(
          <button key={f.key} type="button" className="favoriteChip" onClick={()=>useNeedFavorite(f)}>
            ★ {f.name}
          </button>
        ))}
      </div>
    </div>
  )}

  <form onSubmit={addNeed}>
   <div className="needNameField">
    <input
      type="text"
      placeholder="Ürün adı"
      value={needForm.item_name}
      onChange={e=>setNeedForm({...needForm,item_name:e.target.value})}
      autoComplete="off"
      required
    />

    {needSuggestions.length>0 && (
      <div className="needSuggestions">
        {needSuggestions.map(name=>(
          <button
            type="button"
            key={name}
            onClick={()=>setNeedForm({...needForm,item_name:name})}
          >
            {name}
          </button>
        ))}
      </div>
    )}
   </div>

<input
  type="text"
  placeholder="Birim (adet, koli, paket, kg...)"
  value={needForm.unit}
  onChange={e=>setNeedForm({...needForm,unit:e.target.value})}
  required
/>

    <input
      type="number"
      min="1"
      placeholder="Adet"
      value={needForm.quantity}
      onChange={e=>setNeedForm({...needForm,quantity:e.target.value})}
      required
    />

    <input
      type="text"
      placeholder="Not (isteğe bağlı)"
      value={needForm.note}
      onChange={e=>setNeedForm({...needForm,note:e.target.value})}
    />

    <div className="needFormActions">
      <button type="submit">
        İhtiyaç Ekle
      </button>
      <button type="button" className="secondary" onClick={toggleNeedFavorite}>
        {needFavorites.some(f=>f.key===needForm.item_name.trim().toLocaleLowerCase('tr-TR')+'__'+(needForm.unit.trim()||'adet').toLocaleLowerCase('tr-TR'))
          ? '★ Sık Kullanılandan Çıkar'
          : '☆ Sık Kullanılana Ekle'}
      </button>
    </div>
  </form>
</div>

<div className="card">
  <h3>İhtiyaç Listesi</h3>
<button
  type="button"
  onClick={sendNeedsList}
>
  Listeyi Gönder
</button>
  {needs.filter(n=>n.branch===selectedBranch).length===0 ? (
    <p>Henüz ihtiyaç eklenmedi.</p>
  ) : (
    <div className="list">
      {needs
        .filter(n=>n.branch===selectedBranch)
        .sort((a,b)=>Number(Boolean(a.completed))-Number(Boolean(b.completed)))
        .map(n=>
         <div className="productRow" key={n.id}>
  <div>
    <b>{n.item_name}</b>
    <small>
      {n.quantity} {n.unit}
      {n.note ? ` • ${n.note}` : ''}
    </small>
  </div>

{profile?.role==='admin' && (
  <div>
    {n.completed ? (
      <button
        type="button"
        className="secondary"
        disabled
      >
        ✓ ALINDI
      </button>
    ) : (
      <>
        <button
          type="button"
          onClick={()=>partialNeed(n.id,n.quantity)}
        >
          Kısmi Teslim
        </button>

        <button
          type="button"
          onClick={()=>completeNeed(n.id)}
        >
          Tamamlandı
        </button>
      </>
    )}

    <button
      type="button"
      className="secondary"
      onClick={()=>deleteNeed(n.id)}
    >
      Sil
    </button>
  </div>
)}
</div>
        )}
      {profile?.role==='admin' &&
  needs.some(n=>n.branch===selectedBranch) && (
    <button
      type="button"
      onClick={finishNeedsList}
      style={{marginTop:'16px'}}
    >
      ✓ Listeyi Bitir
    </button>
)}
    </div>
  )}
</div>
  </>}
</>}
    {tab==='products' && <>
  {profile?.role==='admin' && !productBranch ? (
    <>
      <div className="sectionTitle">
        <h1>Üniversite Seç</h1>
      </div>

      <div className="list">
        <button
          className="productRow"
          onClick={()=>setProductBranch('veteriner')}
        >
          <div>
            <b>Veteriner Fakültesi</b>
            <small>Stokları görüntüle</small>
          </div>
        </button>

        <button
          className="productRow"
          onClick={()=>setProductBranch('iktisat')}
        >
          <div>
            <b>İktisat Fakültesi</b>
            <small>Stokları görüntüle</small>
          </div>
        </button>

        <button
          className="productRow"
          onClick={()=>setProductBranch('suna_uzal')}
        >
          <div>
            <b>Suna UZAL</b>
            <small>Stokları görüntüle</small>
          </div>
        </button>

        <button
          className="productRow"
          onClick={()=>setProductBranch('uso')}
        >
          <div>
            <b>USO</b>
            <small>Stokları görüntüle</small>
          </div>
        </button>
      </div>
    </>
  ) : (
    <>
      <div className="sectionTitle">
        <h1>
          {(profile?.role==='branch' ? profile.branch : productBranch)==='veteriner'
            ? 'Veteriner Fakültesi'
            : (profile?.role==='branch' ? profile.branch : productBranch)==='iktisat'
              ? 'İktisat Fakültesi'
              : (profile?.role==='branch' ? profile.branch : productBranch)==='suna_uzal'
                ? 'Suna UZAL'
                : 'USO'} Stokları
        </h1>

        {profile?.role==='admin' && (
          <button
            className="secondary"
            onClick={()=>setProductBranch(null)}
          >
            Üniversite Değiştir
          </button>
        )}
      </div>

      <div className="productTopActions">
        <button onClick={()=>startScanner('quick')}>
          <Barcode size={18}/> Hızlı Mal Girişi
        </button>
        <button className="secondary" onClick={()=>openNew()}>
          <Plus size={18}/> Yeni Ürün
        </button>
      </div>

      <div className="search">
        <Search size={18}/>
        <input
          placeholder="Ürün veya barkod ara"
          value={query}
          onChange={e=>setQuery(e.target.value)}
        />
      </div>

      <div className="list">
        {filtered
          .filter(p=>batches.some(b=>
            b.product_id===p.id &&
            b.branch===(profile?.role==='branch' ? profile.branch : productBranch)
          ))
          .map(p=>
            <button
              className="productRow"
              key={p.id}
              onClick={()=>openProduct(p)}
            >
              <div>
                <b>{p.name}</b>
                <small>{p.barcode || 'Barkod yok'}</small>
              </div>
            </button>
          )
        }
      </div>
    </>
  )}
</>}
    {tab==='expiry' && <>
  <div className="sectionTitle">
    <h1>SKT Takibi</h1>
  </div>

  {profile?.role==='admin' && (
    <div className="list">
      <button
        className={selectedBranch==='veteriner' ? '' : 'secondary'}
        onClick={()=>setSelectedBranch('veteriner')}
      >
        Veteriner Fakültesi
      </button>

      <button
        className={selectedBranch==='iktisat' ? '' : 'secondary'}
        onClick={()=>setSelectedBranch('iktisat')}
      >
        İktisat Fakültesi
      </button>

      <button
        className={selectedBranch==='suna_uzal' ? '' : 'secondary'}
        onClick={()=>setSelectedBranch('suna_uzal')}
      >
        Suna UZAL
      </button>

      <button
        className={selectedBranch==='uso' ? '' : 'secondary'}
        onClick={()=>setSelectedBranch('uso')}
      >
        USO
      </button>
    </div>
  )}

  <div className="list">
    {expiryList
      .filter(b=>b.branch===selectedBranch)
      .map(b=><BatchRow key={b.id} b={b}/>)
    }

    {!expiryList.filter(b=>b.branch===selectedBranch).length && (
      <Empty text="Bu şubede yaklaşan SKT kaydı yok."/>
    )}
  </div>
</>}
      {tab==='settings' && <>
        <div className="sectionTitle settingsTitle">
          <h1>Ayarlar</h1>
        </div>

        <div className="settingsTabs" role="tablist" aria-label="Ayar bölümleri">
          <button
            type="button"
            className={settingsTab==='general' ? 'active' : ''}
            onClick={()=>setSettingsTab('general')}
          >
            Genel
          </button>

          {profile?.role==='admin' && (
            <button
              type="button"
              className={settingsTab==='users' ? 'active' : ''}
              onClick={()=>setSettingsTab('users')}
            >
              Kullanıcılar
            </button>
          )}

          <button
            type="button"
            className={settingsTab==='account' ? 'active' : ''}
            onClick={()=>setSettingsTab('account')}
          >
            Hesap
          </button>
        </div>

        {settingsTab==='general' && <>
          <div className="card themeSetting">
            <div className="themeSettingText">
              <h3>Görünüm</h3>
              <p>{darkMode ? 'Gece modu açık.' : 'Gündüz modu açık.'} Seçimin bu cihazda hatırlanır.</p>
            </div>

            <button
              type="button"
              className={`themeToggle ${darkMode ? 'on' : ''}`}
              onClick={()=>setDarkMode(v=>!v)}
              aria-pressed={darkMode}
              aria-label={darkMode ? 'Gece modunu kapat' : 'Gece modunu aç'}
            >
              {darkMode ? <Moon size={18}/> : <Sun size={18}/>}
              <span>{darkMode ? 'Gece Modu' : 'Gündüz Modu'}</span>
              <span className="themeSwitchTrack" aria-hidden="true">
                <span className="themeSwitchKnob" />
              </span>
            </button>
          </div>

          <div className="card settingsCard">
            <h3>Bildirimler</h3>
            <p>SKT yaklaşan ürünler için bu telefonda bildirim alabilir ve test bildirimi gönderebilirsin.</p>

            <div className="settingsActions">
              <button onClick={notify}>
                Bildirimleri Aç
              </button>

              <button
                className="secondary"
                onClick={testNotification}
              >
                Test Bildirimi Gönder
              </button>
            </div>
          </div>
        </>}

        {profile?.role==='admin' && settingsTab==='users' && (
          <div className="card userSettingsCard">
            <div className="settingsCardHeader">
              <div>
                <h3>Kullanıcılar</h3>
                <p>Uygulamaya girebilecek e-posta adreslerini ve yetkilerini buradan yönet.</p>
              </div>
            </div>

            <form onSubmit={addAllowedUser} className="userAddForm">
              <label>
                E-posta Adresi
                <input
                  type="email"
                  placeholder="ornek@eposta.com"
                  value={userForm.email}
                  onChange={e=>setUserForm({...userForm,email:e.target.value})}
                  required
                />
              </label>

              <label>
                Yetki / Kantin
                <select
                  value={userForm.role==='admin' ? 'admin' : userForm.branch}
                  onChange={e=>{
                    const value=e.target.value

                    if(value==='admin'){
                      setUserForm({...userForm,role:'admin',branch:''})
                    }else{
                      setUserForm({...userForm,role:'branch',branch:value})
                    }
                  }}
                >
                  <option value="admin">Yönetici</option>
                  <option value="veteriner">Veteriner Fakültesi</option>
                  <option value="iktisat">İktisat Fakültesi</option>
                  <option value="suna_uzal">Suna UZAL</option>
                  <option value="uso">USO</option>
                </select>
              </label>

              <button type="submit">
                E-posta Ekle
              </button>
            </form>

            <div className="settingsDivider" />

            <h3>Yetkili E-postalar</h3>

            <div className="list userAccessList">
              {allowedUsers.map(u=>(
                <div className="userAccessRow" key={u.email}>
                  <div className="userAccessInfo">
                    <b>{u.email}</b>
                    <small>
                      {u.role==='admin'
                        ? 'Yönetici'
                        : u.branch==='veteriner'
                          ? 'Veteriner Fakültesi'
                          : u.branch==='iktisat'
                            ? 'İktisat Fakültesi'
                            : u.branch==='suna_uzal'
                              ? 'Suna UZAL'
                              : u.branch==='uso'
                                ? 'USO'
                                : 'Şube atanmamış'}
                    </small>
                  </div>

                  <div className="userAccessActions">
                    <select
                      value={u.role==='admin' ? 'admin' : (u.branch || '')}
                      onChange={e=>{
                        const value=e.target.value

                        if(value==='admin'){
                          updateAllowedUser(u.email,'admin',null)
                        }else{
                          updateAllowedUser(u.email,'branch',value)
                        }
                      }}
                    >
                      <option value="admin">Yönetici</option>
                      <option value="veteriner">Veteriner Fakültesi</option>
                      <option value="iktisat">İktisat Fakültesi</option>
                      <option value="suna_uzal">Suna UZAL</option>
                      <option value="uso">USO</option>
                    </select>

                    <button
                      type="button"
                      className="secondary"
                      onClick={()=>removeAllowedUser(u.email)}
                    >
                      Erişimi Kaldır
                    </button>
                  </div>
                </div>
              ))}

              {!allowedUsers.length && (
                <Empty text="Henüz yetkili e-posta eklenmedi." />
              )}
            </div>
          </div>
        )}

        {settingsTab==='account' && (
          <div className="card settingsCard">
            <h3>Hesap</h3>
            <p className="accountEmail">{session.user.email}</p>
            <button className="secondary" onClick={signOut}>Çıkış Yap</button>
          </div>
        )}
      </>}
    </main>
    {profile?.role === 'admin' ? (
  <nav>
    {[
      ['home',Boxes,'Ana Sayfa'],
      ['products',Search,'Ürünler'],
      ['needs',ClipboardList,'İhtiyaçlar'],
      ['expiry',CalendarDays,'SKT'],
      ['settings',Settings,'Ayarlar']
    ].map(([id,Icon,label])=>
      <button
        key={id}
        className={tab===id?'active':''}
        onClick={()=>setTab(id)}
      >
        <Icon size={22}/>
        {id==='needs' && totalPendingNeeds>0 && (
          <span className="navNeedBadge">{totalPendingNeeds>9 ? '9+' : totalPendingNeeds}</span>
        )}
        <span>{label}</span>
      </button>
    )}
  </nav>
) : (
  <nav>
  <button
    className={tab==='products' ? 'active' : ''}
    onClick={()=>setTab('products')}
  >
    <Search size={22}/>
    <span>Ürünler</span>
  </button>

  <button
    className={tab==='needs' ? 'active' : ''}
    onClick={()=>setTab('needs')}
  >
    <ClipboardList size={22}/>
    <span>İhtiyaçlar</span>
  </button>

  <button
    className={tab==='expiry' ? 'active' : ''}
    onClick={()=>setTab('expiry')}
  >
    <CalendarDays size={22}/>
    <span>SKT</span>
  </button>

  <button
    className={tab==='settings' ? 'active' : ''}
    onClick={()=>setTab('settings')}
  >
    <Settings size={22}/>
    <span>Ayarlar</span>
  </button>
</nav>
)}
    {message&&<div className="toast">{message}</div>}
    {scanner&&<div className="scanner"><button className="close" onClick={()=>{scannerControls.current?.stop();setScanner(false)}}><X/></button><video ref={videoRef}/><div className="frame"></div><p>Barkodu çerçevenin içine getir</p></div>}
    {modal&&<Modal close={()=>setModal(null)}>
      {modal==='new'?<ProductForm title="Yeni ürün" form={productForm} setForm={setProductForm} batch={batchForm} setBatch={setBatchForm} submit={saveNew} scan={()=>startScanner('new')} isNew/>:
      <ProductDetail product={productForm} setProduct={setProductForm} batches={batches.filter(b=>
  b.product_id===productForm.id &&
  b.branch===(profile?.role==='branch' ? profile.branch : productBranch)
)} batch={batchForm} setBatch={setBatchForm} update={updateProduct} addBatch={addBatch} changeQty={changeQty} openBatch={openBatch} deleteBatch={deleteBatch} deleteProduct={deleteProduct} quickMode={quickScanAfterSave}/>} 
    </Modal>}
  </div>
}

function Login({login,setLogin,error,submit,signUp}){
  const [register,setRegister]=useState(false)
  const [registerError,setRegisterError]=useState('')
  const [registerSuccess,setRegisterSuccess]=useState('')
  const [busy,setBusy]=useState(false)
  const [showPassword,setShowPassword]=useState(false)

  async function handleSubmit(e){
    if(!register){
      return submit(e)
    }

    e.preventDefault()
    setRegisterError('')
    setRegisterSuccess('')

    if(!login.email || !login.password){
      return setRegisterError('E-posta ve şifre gerekli.')
    }

    if(login.password.length < 6){
      return setRegisterError('Şifre en az 6 karakter olmalı.')
    }

    setBusy(true)

    try{
    await signUp(login.email,login.password)

setRegisterSuccess('Hesabın oluşturuldu. Şimdi giriş yapabilirsin.')

      setRegister(false)
    }catch(e){
      setRegisterError(
        e.message?.includes('Database error')
          ? 'Bu e-posta adresinin kayıt izni yok veya hesap zaten mevcut.'
          : e.message
      )
    }finally{
      setBusy(false)
    }
  }

  return <div className="login">
    <div className="brand">
      <img src="/icon.svg"/>
      <h1>StokCep</h1>
      <p>Ortak stok takibi</p>
    </div>

    <form onSubmit={handleSubmit}>
      <h2>{register ? 'Kayıt Ol' : 'Giriş Yap'}</h2>

   <input
  type="email"
  name="username"
  autoComplete="username"
  placeholder="E-posta"
  value={login.email}
  onChange={e=>setLogin({...login,email:e.target.value})}
  required
/>

    <div style={{position:'relative'}}>
  <input
    type={showPassword ? 'text' : 'password'}
    name="password"
    autoComplete={register ? "new-password" : "current-password"}
    placeholder="Şifre"
    value={login.password}
    onChange={e=>setLogin({...login,password:e.target.value})}
    required
    style={{paddingRight:'48px'}}
  />

  <button
    type="button"
    onClick={()=>setShowPassword(!showPassword)}
    aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
    style={{
      position:'absolute',
      right:'14px',
      top:'50%',
      transform:'translateY(-50%)',
      background:'transparent',
      border:'none',
      padding:0,
      width:'auto',
      minWidth:0,
      color:'#64748b',
      cursor:'pointer'
    }}
  >
    {showPassword ? <EyeOff size={20}/> : <Eye size={20}/>}
  </button>
</div>

      {(registerError || error) &&
        <p className="error">{registerError || error}</p>
      }

      {registerSuccess &&
        <p>{registerSuccess}</p>
      }

      <button type="submit" disabled={busy}>
        {busy ? 'Bekleyin...' : register ? 'Hesap Oluştur' : 'Giriş Yap'}
      </button>

      <button
        type="button"       
        className="secondary"
        onClick={()=>{
          setRegister(!register)
          setRegisterError('')
        }}
      >
        {register ? 'Giriş ekranına dön' : 'Kayıt Ol'}
      </button>
    </form>
  </div>
}
function SetupMissing(){return <div className="login"><div className="brand"><img src="/icon.svg"/><h1>StokCep hazır</h1><p>Bağlantı bilgileri henüz girilmemiş. Paketteki KURULUM.md dosyasındaki adımları tamamla.</p></div></div>}
function Stat({n,t,warn,danger}){return <div className={'stat '+(warn?'warn ':'')+(danger?'danger':'')}><strong>{n}</strong><span>{t}</span></div>}
function Empty({text}){return <div className="empty">{text}</div>}
function BatchRow({b}){
  const d=daysLeft(b.expiry_date)

  return (
    <div className="batchRow">
      <div>
        <b>{b.products?.name || 'Ürün'}</b>
        <small>
          {b.quantity} adet · {fmt(b.expiry_date)}
        </small>
      </div>

      <span className={d<0 ? 'pill red' : d<=10 ? 'pill orange' : 'pill'}>
        {d<0
          ? `${Math.abs(d)} gün geçti`
          : d===0
            ? 'Bugün'
            : `${d} gün`}
      </span>
    </div>
  )
}
function Modal({children,close}){return <div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><div className="modal"><button className="closeModal" onClick={close}><X/></button>{children}</div></div>}
function ProductForm({title,form,setForm,batch,setBatch,submit,scan,isNew}){
  return (
    <form onSubmit={submit}>
      <h2>{title}</h2>

      <label>
        Barkod
        <div className="inline">
          <input
            value={form.barcode || ''}
            onChange={e=>setForm({...form,barcode:e.target.value})}
            placeholder="Barkod"
          />
          <button type="button" onClick={scan}>
            <Barcode size={18}/> Okut
          </button>
        </div>
      </label>

      <label>
        Ürün Adı
        <input
          value={form.name || ''}
          onChange={e=>setForm({...form,name:e.target.value})}
          placeholder="Ürün adı"
          required
        />
      </label>

     <label>
  Giriş Şekli
  <select
    value={form.unit || 'adet'}
    onChange={e=>setForm({...form,unit:e.target.value})}
  >
    <option value="adet">Adet</option>
    <option value="kutu">Kutu</option>
  </select>
</label>

{form.unit==='kutu' && (
  <label>
    1 Kutuda Kaç Adet?
    <input
      type="number"
      min="1"
      value={form.box_size || 1}
      onChange={e=>setForm({...form,box_size:Number(e.target.value)})}
      required
    />
  </label>
)}

<label>
  {form.unit==='kutu' ? 'Kaç Kutu Geldi?' : 'Kaç Adet Geldi?'}
  <input
    type="number"
    min="1"
    value={batch.quantity}
    onChange={e=>setBatch({...batch,quantity:e.target.value})}
    required
  />
</label>
      <label>
        Son Kullanma Tarihi
        <input
          type="date"
          value={batch.expiry_date || ''}
          onChange={e=>setBatch({...batch,expiry_date:e.target.value})}
          required
        />
      </label>

      <label>
        Not
        <input
          value={form.notes || ''}
          onChange={e=>setForm({...form,notes:e.target.value})}
          placeholder="İsteğe bağlı"
        />
      </label>

      <button type="submit">
        {isNew ? 'Stoğa Ekle' : 'Kaydet'}
      </button>
    </form>
  )
}
function ProductDetail({
  product,
  setProduct,
  batches,
  batch,
  setBatch,
  update,
  addBatch,
  openBatch,
  deleteBatch,
  deleteProduct,
  quickMode
}){
  const isBox=Number(product.box_size)>1
  const sortedBatches=[...batches].sort((a,b)=>a.expiry_date.localeCompare(b.expiry_date))
  const groupedBatches=Object.values(sortedBatches.reduce((acc,b)=>{
    const key=b.expiry_date || 'tarihsiz'
    if(!acc[key]) acc[key]={key,expiry_date:b.expiry_date,rows:[]}
    acc[key].rows.push(b)
    return acc
  },{})).map(g=>({
    ...g,
    openRows:g.rows.filter(r=>r.status==='open'),
    closedRows:g.rows.filter(r=>r.status!=='open'),
    totalQty:g.rows.reduce((sum,r)=>sum+Number(r.quantity||0),0)
  }))

  const earliestClosedExpiry=isBox
    ? groupedBatches.find(g=>g.closedRows.length)?.expiry_date
    : null

  return (
    <div className={`productDetailRoot ${quickMode ? 'quick' : ''}`}>
      <div className="productDetailHeader">
        <div>
          <h2>{product.name}</h2>
          <p>{product.barcode || 'Barkod yok'}</p>
        </div>
        {quickMode && <span className="quickModeBadge">Hızlı Giriş</span>}
      </div>

      <h3>SKT / Partiler</h3>

      <div className="list compact batchGroups">
        {isBox ? groupedBatches.map(g=>{
          const isFirst=g.expiry_date===earliestClosedExpiry && g.closedRows.length>0
          const finishRow=g.openRows[0] || g.closedRows[0]

          return (
            <div className={`batchGroup ${isFirst ? 'firstToOpen' : ''}`} key={g.key}>
              <div className="batchGroupInfo">
                <div className="batchGroupTitle">
                  <b>{fmt(g.expiry_date)}</b>
                  {isFirst && <span className="firstOpenBadge">ÖNCE BUNU AÇ</span>}
                </div>
                <small>
                  {g.rows.length} kutu · {g.openRows.length} açık · {g.closedRows.length} kapalı
                </small>
              </div>

              <div className="batchGroupActions">
                {g.closedRows.length>0 && (
                  <button type="button" className="secondary" onClick={()=>openBatch(g.closedRows[0])}>
                    Kutu Aç
                  </button>
                )}
                {finishRow && (
                  <button type="button" className="dangerBtn" onClick={()=>deleteBatch(finishRow.id)}>
                    1 Kutu Bitti
                  </button>
                )}
              </div>
            </div>
          )
        }) : sortedBatches.map(b=>(
          <div className="manageBatch" key={b.id}>
            <div>
              <b>{fmt(b.expiry_date)}</b>
              <small>{b.quantity} adet</small>
            </div>
            <div className="qty">
              <button type="button" className="dangerBtn" onClick={()=>deleteBatch(b.id)}>
                Bitti
              </button>
            </div>
          </div>
        ))}

        {!sortedBatches.length && <Empty text="Bu üründe aktif parti yok."/>}
      </div>

      <form onSubmit={addBatch} className="addBatch quickBatchForm">
        <h3>+ Yeni Parti Ekle</h3>

        {isBox ? (
          <label>
            Kaç Kutu Geldi?
            <input
              type="number"
              min="1"
              required
              value={batch.box_count || 1}
              onChange={e=>setBatch({...batch,box_count:e.target.value})}
            />
          </label>
        ) : (
          <label>
            Adet
            <input
              type="number"
              min="1"
              required
              value={batch.quantity}
              onChange={e=>setBatch({...batch,quantity:e.target.value})}
            />
          </label>
        )}

        <label>
          Son Kullanma Tarihi
          <input
            type="date"
            required
            value={batch.expiry_date}
            onChange={e=>setBatch({...batch,expiry_date:e.target.value})}
          />
        </label>

        <button>{quickMode ? 'Kaydet ve Sonraki Barkodu Okut' : 'Partiyi Ekle'}</button>
      </form>

      <details style={{marginTop:'18px'}}>
        <summary style={{cursor:'pointer',fontWeight:700}}>Ürün bilgilerini düzenle</summary>

        <form onSubmit={update} style={{marginTop:'12px'}}>
          <label>
            Ürün Adı
            <input value={product.name || ''} onChange={e=>setProduct({...product,name:e.target.value})} required />
          </label>

          <label>
            Barkod
            <input value={product.barcode || ''} onChange={e=>setProduct({...product,barcode:e.target.value})} />
          </label>

          <label>
            Not
            <input value={product.notes || ''} onChange={e=>setProduct({...product,notes:e.target.value})} />
          </label>

          {isBox && (
            <label>
              1 Kutuda Kaç Adet?
              <input
                type="number"
                min="1"
                value={product.box_size || 1}
                onChange={e=>setProduct({...product,box_size:Number(e.target.value)})}
              />
            </label>
          )}

          <button>Ürün Bilgilerini Kaydet</button>
        </form>
      </details>

      <button className="deleteProduct" onClick={()=>deleteProduct(product.id)}>
        <Trash2 size={18}/> Ürünü Sil
      </button>
    </div>
  )
}
