import React, {useState, useEffect, useRef} from 'react'
export default function App(){
  const [msgs, setMsgs] = useState([])
  const ws = useRef()
  useEffect(()=>{
    ws.current = new WebSocket('ws://localhost:8000/ws')
    ws.current.onmessage = e=> setMsgs(m=>[...m, e.data])
    return ()=> ws.current.close()
  },[])
  const send = ()=>{ const t=prompt('Message to Nara'); if(t){ ws.current.send(t)} }
  return (<div style={{padding:20}}> <h3>Nara Hub (dev)</h3>
    <button onClick={send}>Send Msg</button>
    <div style={{marginTop:10}}>{msgs.map((m,i)=><div key={i}>{m}</div>)}</div>
  </div>)
}
