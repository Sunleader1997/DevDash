import { useEffect, useState, useSyncExternalStore } from 'react'
import { taskBus, type HostTask } from './taskBus'

export function TaskFooter(): JSX.Element {
  const [open, setOpen] = useState(false)
  const tasks = useSyncExternalStore(
    (cb) => taskBus.subscribe(cb),
    () => taskBus.list(),
    () => taskBus.list()
  )
  const running = tasks.filter((t) => t.status === 'running')

  useEffect(() => {
    if (running.length === 0 && open) {
      // keep panel open briefly so user can inspect
    }
  }, [running.length, open])

  return (
    <>
      <button
        className="task-footer"
        onClick={() => setOpen((v) => !v)}
        title="查看执行中的任务"
      >
        <span className={`task-pulse${running.length ? ' on' : ''}`} />
        <span>
          {running.length ? `执行中 ${running.length}` : tasks.length ? '最近任务' : '就绪'}
        </span>
      </button>
      {open && (
        <div className="task-panel">
          <div className="task-panel-head">
            <span>任务</span>
            <button className="gm-btn ghost" onClick={() => taskBus.clearFinished()}>
              清理
            </button>
          </div>
          <div className="task-panel-list">
            {tasks.length === 0 && <div className="task-empty">暂无任务</div>}
            {tasks.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </div>
        </div>
      )}
    </>
  )
}

function TaskRow({ task }: { task: HostTask }): JSX.Element {
  const elapsed =
    (task.endedAt ?? Date.now()) - task.startedAt
  return (
    <div className={`task-row ${task.status}`}>
      <div className="task-row-title">
        <span className="task-dot" />
        <span>{task.label}</span>
      </div>
      <div className="task-row-meta">
        <span>{task.status === 'running' ? `${Math.round(elapsed / 1000)}s` : task.status === 'done' ? '完成' : '失败'}</span>
        {task.detail && <span className="task-detail">{task.detail}</span>}
      </div>
      {task.status === 'running' && (
        <div className="task-bar">
          <div className="task-bar-inner" />
        </div>
      )}
    </div>
  )
}
