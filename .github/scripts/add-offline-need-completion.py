from pathlib import Path

path = Path('src/App.jsx')
text = path.read_text(encoding='utf-8')

old_sync = """      }else if(action.type==='addBatch'){
        const result=await supabase.from('batches').insert(action.payload)
        error=result.error
      }
"""

new_sync = """      }else if(action.type==='completeNeed'){
        const result=await supabase
          .from('branch_needs')
          .update({
            completed:true,
            completed_at:action.payload.completed_at || new Date().toISOString()
          })
          .eq('id',action.payload.id)
        error=result.error
      }else if(action.type==='addBatch'){
        const result=await supabase.from('batches').insert(action.payload)
        error=result.error
      }
"""

if old_sync not in text:
    raise SystemExit('sync target not found')
text = text.replace(old_sync, new_sync, 1)

old_complete = """  async function completeNeed(id){
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
"""

new_complete = """  async function completeNeed(id){
  const ok=confirm('Bu ürün alındı olarak işaretlensin mi?')
  if(!ok) return

  const completedAt=new Date().toISOString()

  const markCompletedLocally=()=>{
    setNeeds(prev=>{
      const next=prev.map(n=>
        n.id===id
          ? {...n,completed:true,completed_at:completedAt}
          : n
      )

      try{
        const cached=JSON.parse(localStorage.getItem('okan-sah-data-cache') || 'null')
        if(cached){
          cached.needs=next
          localStorage.setItem('okan-sah-data-cache',JSON.stringify(cached))
        }
      }catch{}

      return next
    })
  }

  const queueCompletion=()=>{
    setOfflineQueue(prev=>{
      if(prev.some(action=>
        action.type==='completeNeed' &&
        action.payload?.id===id
      )) return prev

      return [...prev,{
        id:`${Date.now()}-${Math.random().toString(36).slice(2)}`,
        type:'completeNeed',
        payload:{id,completed_at:completedAt},
        created_at:new Date().toISOString()
      }]
    })
  }

  if(!navigator.onLine){
    markCompletedLocally()
    queueCompletion()
    return flash('✓ Alındı. İnternet gelince diğer cihazlara aktarılacak.')
  }

  const {error}=await supabase
    .from('branch_needs')
    .update({
      completed:true,
      completed_at:completedAt
    })
    .eq('id',id)

  if(error){
    // iPhone bazen bağlantı yokken navigator.onLine=true döndürebiliyor.
    // İşlemi telefonda kaybetme; kuyruğa alıp bağlantı gelince tekrar dene.
    markCompletedLocally()
    queueCompletion()
    return flash('✓ Telefonda alındı olarak işaretlendi; internet gelince senkronlanacak.')
  }

  markCompletedLocally()
  flash('✓ Alındı olarak işaretlendi.')
  loadData()
}
"""

if old_complete not in text:
    raise SystemExit('completeNeed target not found')
text = text.replace(old_complete, new_complete, 1)

path.write_text(text, encoding='utf-8')
print('offline need completion added')
