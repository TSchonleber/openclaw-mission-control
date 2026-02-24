import React from 'react'
import bossSprite from '../assets/office2/boss.png'
import worker1 from '../assets/office2/worker1.png'
import worker2 from '../assets/office2/worker2.png'
import worker4 from '../assets/office2/worker4.png'
import deskPc from '../assets/office2/desk-with-pc.png'
import waterCooler from '../assets/office2/water-cooler.png'
import plant from '../assets/office2/plant.png'
import printer from '../assets/office2/printer.png'
import coffeeMaker from '../assets/office2/coffee-maker.png'
import sink from '../assets/office2/sink.png'
import trash from '../assets/office2/Trash.png'
import cabinet from '../assets/office2/cabinet.png'
import chair from '../assets/office2/Chair.png'
import partition1 from '../assets/office2/office-partitions-1.png'
import partition2 from '../assets/office2/office-partitions-2.png'

const OfficePage = ({ agents, subagents, activity, onBack }) => {
  const withStatus = list => list.map(agent => {
    const last = activity[agent.id]
    const active = last && Date.now() - last < 5 * 60 * 1000
    return { ...agent, status: active ? 'working' : 'idle' }
  })

  const core = withStatus(agents.filter(a => a.tier === 'core'))
  const subs = withStatus(subagents)

  const coreSlots = [
    { id: 'aster', x: 80, y: 60, sprite: bossSprite },
    { id: 'iris', x: 320, y: 60, sprite: worker1 },
    { id: 'nara', x: 560, y: 60, sprite: worker2 },
    { id: 'osiris', x: 800, y: 60, sprite: worker4 }
  ]

  const subSlots = [
    { x: 140, y: 260, sprite: worker1 },
    { x: 320, y: 260, sprite: worker2 },
    { x: 500, y: 260, sprite: worker4 },
    { x: 680, y: 260, sprite: worker1 },
    { x: 860, y: 260, sprite: worker2 }
  ]

  return (
    <div className="office-page pixel-office">
      <header className="task-board-header">
        <div>
          <h1>The Office</h1>
          <p>Live pixel view of the crew at work.</p>
        </div>
        <button type="button" className="ghost" onClick={onBack}>← Back to dashboard</button>
      </header>

      <div className="office-legend">
        <span className="legend working">Working</span>
        <span className="legend idle">Idle</span>
      </div>

      <div className="office-map office-background">
        <img className="office-prop partition" src={partition1} alt="partition" style={{ left: 40, top: 20 }} />
        <img className="office-prop partition" src={partition2} alt="partition" style={{ left: 520, top: 20 }} />
        <img className="office-prop watercooler" src={waterCooler} alt="watercooler" style={{ left: 40, top: 360 }} />
        <img className="office-prop plant" src={plant} alt="plant" style={{ left: 60, top: 320 }} />
        <img className="office-prop printer" src={printer} alt="printer" style={{ left: 480, top: 360 }} />
        <img className="office-prop coffee" src={coffeeMaker} alt="coffee maker" style={{ left: 720, top: 360 }} />
        <img className="office-prop sink" src={sink} alt="sink" style={{ left: 820, top: 360 }} />
        <img className="office-prop trash" src={trash} alt="trash" style={{ left: 600, top: 360 }} />
        <img className="office-prop cabinet" src={cabinet} alt="cabinet" style={{ left: 240, top: 360 }} />

        {coreSlots.map(slot => {
          const agent = core.find(item => item.id === slot.id)
          if (!agent) return null
          return (
            <div key={slot.id} className={`office-seat ${agent.status}`} style={{ left: slot.x, top: slot.y }}>
              <img src={deskPc} alt="desk" className="desk" />
              <img src={chair} alt="chair" className="chair" />
              <div className={`sprite ${agent.status}`} style={{ backgroundImage: `url(${slot.sprite})` }} />
              <span className="sprite-label">{agent.name}</span>
            </div>
          )
        })}

        {subs.map((agent, index) => {
          const slot = subSlots[index % subSlots.length]
          return (
            <div key={agent.id} className={`office-seat ${agent.status}`} style={{ left: slot.x, top: slot.y }}>
              <img src={deskPc} alt="desk" className="desk" />
              <img src={chair} alt="chair" className="chair" />
              <div className={`sprite ${agent.status}`} style={{ backgroundImage: `url(${slot.sprite})` }} />
              <span className="sprite-label">{agent.name}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default OfficePage
