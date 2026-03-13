import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { dataService } from './dataService'
import type { EducationBatch, Employee, EntryExitLog, RewardRecord, RiskSource } from './types'

const MS_PER_DAY = 1000 * 60 * 60 * 24

const formatDate = (date: string) => date.replace(/-/g, '.')

const getReferenceDate = (logs: EntryExitLog[]) => {
  const todayIso = new Date().toISOString().slice(0, 10)
  if (logs.some((log) => log.date === todayIso)) {
    return todayIso
  }
  if (logs.length > 0) {
    return [...logs].sort((a, b) => b.date.localeCompare(a.date))[0].date
  }
  return todayIso
}

const daysUntil = (from: string, to: string) => {
  const fromDate = new Date(from)
  const toDate = new Date(to)
  return Math.ceil((toDate.getTime() - fromDate.getTime()) / MS_PER_DAY)
}

const progressLabel = (value: number) => {
  if (value >= 100) return '已完成三级'
  if (value >= 66) return '已完成两级'
  if (value > 0) return '已完成一级'
  return '未开始'
}

const StatusPill = ({ label, tone }: { label: string; tone: 'good' | 'warn' | 'muted' }) => (
  <span className={`pill pill-${tone}`}>{label}</span>
)

const MetricCard = ({
  label,
  value,
  sub,
  tone
}: {
  label: string
  value: string | number
  sub: string
  tone: 'neutral' | 'warn' | 'good'
}) => (
  <div className={`metric-card metric-${tone}`}>
    <div className="metric-label">{label}</div>
    <div className="metric-value">{value}</div>
    <div className="metric-sub">{sub}</div>
  </div>
)

function App() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [educationBatches, setEducationBatches] = useState<EducationBatch[]>([])
  const [entryExitLogs, setEntryExitLogs] = useState<EntryExitLog[]>([])
  const [rewards, setRewards] = useState<RewardRecord[]>([])
  const [risks, setRisks] = useState<RiskSource[]>([])
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const loadData = async () => {
      try {
        const [employeesData, educationData, entryData, rewardData, riskData] = await Promise.all([
          dataService.getEmployees(),
          dataService.getEducationBatches(),
          dataService.getEntryExitLogs(),
          dataService.getRewards(),
          dataService.getRisks()
        ])
        if (!active) return
        setEmployees(employeesData)
        setEducationBatches(educationData)
        setEntryExitLogs(entryData)
        setRewards(rewardData)
        setRisks(riskData)
        setLoading(false)
      } catch (err) {
        if (!active) return
        setError(err instanceof Error ? err.message : '数据加载失败')
        setLoading(false)
      }
    }
    loadData()
    return () => {
      active = false
    }
  }, [])

  const referenceDate = useMemo(() => getReferenceDate(entryExitLogs), [entryExitLogs])

  const {
    onsiteEmployees,
    todayEntryCount,
    todayExitCount,
    pendingEducationCount,
    violationCount
  } = useMemo(() => {
    const onsite = employees.filter((employee) => employee.status === '在场')
    const todayEntry = entryExitLogs.filter(
      (log) => log.date === referenceDate && log.type === '进场'
    )
    const todayExit = entryExitLogs.filter(
      (log) => log.date === referenceDate && log.type === '退场'
    )
    const pendingEducation = onsite.filter((employee) => employee.educationProgress < 100)
    const monthKey = referenceDate.slice(0, 7)
    const violations = rewards.filter(
      (record) => record.type === '处罚' && record.date.startsWith(monthKey)
    )

    return {
      onsiteEmployees: onsite.length,
      todayEntryCount: todayEntry.length,
      todayExitCount: todayExit.length,
      pendingEducationCount: pendingEducation.length,
      violationCount: violations.length
    }
  }, [employees, entryExitLogs, rewards, referenceDate])

  const educationStats = useMemo(() => {
    const complete = employees.filter((employee) => employee.educationProgress >= 100).length
    const two = employees.filter(
      (employee) => employee.educationProgress >= 66 && employee.educationProgress < 100
    ).length
    const one = employees.filter(
      (employee) => employee.educationProgress > 0 && employee.educationProgress < 66
    ).length
    const none = employees.filter((employee) => employee.educationProgress <= 0).length
    const total = employees.length
    return {
      total,
      segments: [
        { label: '已完成三级', value: complete, color: 'var(--green)' },
        { label: '仅完成两级', value: two, color: 'var(--amber)' },
        { label: '仅完成一级', value: one, color: 'var(--orange)' },
        { label: '未开始', value: none, color: 'var(--slate-300)' }
      ]
    }
  }, [employees])

  const educationGradient = useMemo(() => {
    const total = educationStats.segments.reduce((sum, seg) => sum + seg.value, 0) || 1
    let offset = 0
    return educationStats.segments
      .map((segment) => {
        const start = (offset / total) * 100
        offset += segment.value
        const end = (offset / total) * 100
        return `${segment.color} ${start}% ${end}%`
      })
      .join(', ')
  }, [educationStats])

  const alerts = useMemo(() => {
    const list: { id: string; message: string; tone: 'warn' | 'danger' }[] = []
    employees
      .filter((employee) => employee.status === '在场' && employee.educationProgress < 100)
      .slice(0, 3)
      .forEach((employee) => {
        list.push({
          id: `edu-${employee.id}`,
          message: `${employee.name} 进场未完成班组级教育，请催办！`,
          tone: 'danger'
        })
      })

    employees
      .filter((employee) => daysUntil(referenceDate, employee.cert.expiry) <= 7)
      .forEach((employee) => {
        const days = daysUntil(referenceDate, employee.cert.expiry)
        if (days < 0) return
        list.push({
          id: `cert-${employee.id}`,
          message: `${employee.name} 的${employee.cert.name}将于 ${days} 天后到期！`,
          tone: 'warn'
        })
      })

    return list.slice(0, 5)
  }, [employees, referenceDate])

  const riskStats = useMemo(() => {
    const level1 = risks.filter((risk) => risk.level === 'Ⅰ级').length
    const level2 = risks.filter((risk) => risk.level === 'Ⅱ级').length
    const level3 = risks.filter((risk) => risk.level === 'Ⅲ级').length
    const attention = risks.filter((risk) => risk.status !== '在控').length
    return { level1, level2, level3, attention }
  }, [risks])

  const filteredEmployees = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    if (!keyword) return employees
    return employees.filter((employee) =>
      [employee.name, employee.role, employee.team].some((value) =>
        value.toLowerCase().includes(keyword)
      )
    )
  }, [employees, search])

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-card">
          <div className="loading-title">安全管理台账系统</div>
          <div className="loading-text">正在加载最新台账数据...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="loading-screen">
        <div className="loading-card error">
          <div className="loading-title">数据加载失败</div>
          <div className="loading-text">{error}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">安</div>
          <div>
            <div className="brand-title">项目安全管理台账系统</div>
            <div className="brand-sub">一人一档 · 动态台账 · 安全闭环</div>
          </div>
        </div>
        <nav className="nav">
          <a href="#dashboard">总览</a>
          <a href="#roster">人员台账</a>
          <a href="#education">三级教育</a>
          <a href="#risk">风险源</a>
          <a href="#movement">进出场</a>
          <a href="#reward">奖惩记录</a>
        </nav>
        <div className="topbar-actions">
          <div className="date-chip">数据日期 {formatDate(referenceDate)}</div>
          <button className="primary-btn">发起新教育批次</button>
        </div>
      </header>

      <main>
        <section className="section hero">
          <div className="hero-card">
            <div>
              <div className="hero-eyebrow">专属定制 · 管理台账</div>
              <h1>工程建设企业项目安全管理台账系统</h1>
              <p>
                以“人员全生命周期档案 + 全景安全看板”为核心，适用于各类项目安全管理场景。
              </p>
            </div>
            <div className="hero-profile">
              <div className="hero-avatar">安</div>
              <div>
                <div className="hero-name">安全管理负责人</div>
                <div className="hero-role">项目安全部</div>
                <div className="hero-company">某大型工程建设集团</div>
              </div>
            </div>
          </div>
        </section>

        <section id="dashboard" className="section">
          <div className="section-head">
            <div>
              <h2>全景数据看板</h2>
              <p>把项目安全关键指标集中呈现，及时发现风险与缺口。</p>
            </div>
            <div className="section-meta">
              <span>今日进场/退场以 {formatDate(referenceDate)} 为准</span>
            </div>
          </div>

          <div className="metrics-grid">
            <MetricCard
              label="当前在场"
              value={onsiteEmployees}
              sub="在场人员总数"
              tone="neutral"
            />
            <MetricCard label="今日进场" value={todayEntryCount} sub="新增入场" tone="good" />
            <MetricCard label="今日退场" value={todayExitCount} sub="办理退场" tone="neutral" />
            <MetricCard
              label="教育未完成"
              value={pendingEducationCount}
              sub="需催办"
              tone="warn"
            />
            <MetricCard
              label="本月违规"
              value={violationCount}
              sub="处罚事件"
              tone="warn"
            />
          </div>

          <div className="dashboard-grid">
            <div className="panel">
              <div className="panel-head">
                <h3>安全教育完成度</h3>
                <span className="panel-sub">覆盖全员三级教育进展</span>
              </div>
              <div className="education-chart">
                <div
                  className="donut"
                  style={{ background: `conic-gradient(${educationGradient})` }}
                >
                  <div className="donut-center">
                    <div className="donut-total">{educationStats.total}</div>
                    <div className="donut-label">在册人数</div>
                  </div>
                </div>
                <div className="legend">
              {educationStats.segments.map((segment) => (
                <div key={segment.label} className="legend-item">
                  <span className="legend-dot" style={{ background: segment.color }} />
                  <div>
                    <div className="legend-label">{segment.label}</div>
                    <div className="legend-value">
                      {segment.value} 人 ·{' '}
                      {Math.round(
                        (segment.value / (educationStats.total || 1)) * 100
                      ) || 0}
                      %
                    </div>
                  </div>
                </div>
              ))}
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">
                <h3>动态待办与预警</h3>
                <span className="panel-sub">自动推送到安全员</span>
              </div>
              <div className="alert-list">
                {alerts.length === 0 ? (
                  <div className="empty">暂无预警，状态良好</div>
                ) : (
                  alerts.map((alert) => (
                    <div key={alert.id} className={`alert-card alert-${alert.tone}`}>
                      <span className="alert-dot" />
                      <span>{alert.message}</span>
                    </div>
                  ))
                )}
              </div>
              <div className="panel-footer">
                <span>自动提醒证件到期与教育欠缺</span>
                <button className="ghost-btn">查看全部待办</button>
              </div>
            </div>
          </div>
        </section>

        <section id="roster" className="section">
          <div className="section-head">
            <div>
              <h2>人员基础台账</h2>
              <p>一人一档，覆盖全生命周期与关键证件信息。</p>
            </div>
            <div className="section-actions">
              <input
                className="search-input"
                placeholder="搜索姓名 / 岗位 / 班组"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <button className="ghost-btn">导出台账</button>
            </div>
          </div>

          <div className="table-card">
            <table>
              <thead>
                <tr>
                  <th>姓名</th>
                  <th>岗位</th>
                  <th>所属班组</th>
                  <th>进场日期</th>
                  <th>当前状态</th>
                  <th>教育进度</th>
                  <th>奖惩积分</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((employee) => (
                  <tr key={employee.id} onClick={() => setSelectedEmployee(employee)}>
                    <td>
                      <div className="name-cell">
                        <div className="avatar">{employee.name.slice(0, 1)}</div>
                        <div>
                          <div className="name">{employee.name}</div>
                          <div className="sub">{employee.id}</div>
                        </div>
                      </div>
                    </td>
                    <td>{employee.role}</td>
                    <td>{employee.team}</td>
                    <td>{formatDate(employee.entryDate)}</td>
                    <td>
                      <StatusPill
                        label={employee.status}
                        tone={employee.status === '在场' ? 'good' : 'muted'}
                      />
                    </td>
                    <td>
                      <div className="progress-wrapper">
                        <div className="progress-bar">
                          <span style={{ width: `${employee.educationProgress}%` }} />
                        </div>
                        <span className="progress-label">
                          {employee.educationProgress}% · {progressLabel(employee.educationProgress)}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span
                        className={`score ${employee.score >= 100 ? 'score-good' : 'score-warn'}`}
                      >
                        {employee.score}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section id="education" className="section">
          <div className="section-head">
            <div>
              <h2>三级安全教育管理</h2>
              <p>批次化培训跟踪，强制归档签字材料。</p>
            </div>
            <button className="ghost-btn">查看教育档案</button>
          </div>

          <div className="card-grid">
            {educationBatches.map((batch) => (
              <div key={batch.id} className="card">
                <div className="card-head">
                  <div>
                    <h3>{batch.title}</h3>
                    <p>
                      {batch.level} · 开始于 {formatDate(batch.startDate)} · 讲师 {batch.trainer}
                    </p>
                  </div>
                  <StatusPill
                    label={batch.status}
                    tone={batch.status === '已完成' ? 'good' : 'warn'}
                  />
                </div>
                <div className="card-body">
                  <div className="progress-bar large">
                    <span style={{ width: `${batch.completion}%` }} />
                  </div>
                  <div className="card-stats">
                    <div>
                      <div className="stat-label">参训人数</div>
                      <div className="stat-value">{batch.participants.length} 人</div>
                    </div>
                    <div>
                      <div className="stat-label">完成度</div>
                      <div className="stat-value">{batch.completion}%</div>
                    </div>
                    <div>
                      <div className="stat-label">资料归档</div>
                      <div className="stat-value">
                        {batch.records.team.signed ? '已上传签字' : '待上传签字'}
                      </div>
                    </div>
                  </div>
                  <div className="record-grid">
                    <div className="record-item">
                      <div className="record-title">公司级</div>
                      <div className="record-desc">
                        {batch.records.company.time} · {batch.records.company.hours} 学时 · 评分{' '}
                        {batch.records.company.score}
                      </div>
                    </div>
                    <div className="record-item">
                      <div className="record-title">项目级</div>
                      <div className="record-desc">
                        {batch.records.project.time} · 交底人 {batch.records.project.leader}
                      </div>
                    </div>
                    <div className="record-item">
                      <div className="record-title">班组级</div>
                      <div className="record-desc">
                        {batch.records.team.time} · 班组长 {batch.records.team.leader}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="risk" className="section">
          <div className="section-head">
            <div>
              <h2>风险源识别监控</h2>
              <p>分级分类监控各处风险源，动态掌握重点风险。</p>
            </div>
            <button className="ghost-btn">导出风险源清单</button>
          </div>

          <div className="metrics-grid">
            <MetricCard label="Ⅰ级风险源" value={riskStats.level1} sub="重点监控" tone="warn" />
            <MetricCard label="Ⅱ级风险源" value={riskStats.level2} sub="常规监管" tone="neutral" />
            <MetricCard label="Ⅲ级风险源" value={riskStats.level3} sub="日常巡查" tone="good" />
            <MetricCard label="异常处置" value={riskStats.attention} sub="预警/整改" tone="warn" />
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>风险源清单</h3>
              <span className="panel-sub">最新巡检与处置措施</span>
            </div>
            <div className="risk-list">
              {risks.map((risk) => (
                <div key={risk.id} className="risk-item">
                  <div>
                    <div className="risk-title">{risk.name}</div>
                    <div className="risk-meta">
                      {risk.location} · {risk.category} · 最近巡检 {formatDate(risk.lastCheck)} · 责任人{' '}
                      {risk.owner}
                    </div>
                    <div className="risk-control">措施：{risk.control}</div>
                  </div>
                  <div className="risk-tags">
                    <StatusPill
                      label={risk.level}
                      tone={risk.level === 'Ⅰ级' ? 'warn' : risk.level === 'Ⅱ级' ? 'muted' : 'good'}
                    />
                    <StatusPill
                      label={risk.status}
                      tone={risk.status === '在控' ? 'good' : 'warn'}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="movement" className="section">
          <div className="section-head">
            <div>
              <h2>进出场变动管理</h2>
              <p>记录人员流动轨迹，退场台账只读可追溯。</p>
            </div>
            <button className="ghost-btn">导出进出场记录</button>
          </div>

          <div className="panel">
            <div className="movement-list">
              {entryExitLogs.map((log) => (
                <div key={log.id} className="movement-item">
                  <div className={`movement-tag tag-${log.type}`}>
                    {log.type}
                  </div>
                  <div className="movement-main">
                    <div className="movement-name">{log.name}</div>
                    <div className="movement-detail">
                      {log.reason} · {formatDate(log.date)} · {log.teamFrom} → {log.teamTo}
                    </div>
                  </div>
                  <button className="ghost-btn small">详情</button>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="reward" className="section">
          <div className="section-head">
            <div>
              <h2>安全奖惩记录</h2>
              <p>红黑榜机制，积分驱动行为改进。</p>
            </div>
            <button className="ghost-btn">生成月度通报</button>
          </div>

          <div className="reward-grid">
            <div className="panel">
              <div className="panel-head">
                <h3>安全红榜</h3>
                <span className="panel-sub">正向激励</span>
              </div>
              <div className="reward-list">
                {rewards
                  .filter((record) => record.type === '奖励')
                  .map((record) => (
                    <div key={record.id} className="reward-item">
                      <div>
                        <div className="reward-name">{record.name}</div>
                        <div className="reward-detail">
                          {record.reason} · {formatDate(record.date)}
                        </div>
                      </div>
                      <div className="reward-score">+{record.score}</div>
                    </div>
                  ))}
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">
                <h3>安全黑榜</h3>
                <span className="panel-sub">违规处罚</span>
              </div>
              <div className="reward-list">
                {rewards
                  .filter((record) => record.type === '处罚')
                  .map((record) => (
                    <div key={record.id} className="reward-item warn">
                      <div>
                        <div className="reward-name">{record.name}</div>
                        <div className="reward-detail">
                          {record.reason} · {formatDate(record.date)}
                        </div>
                      </div>
                      <div className="reward-score">{record.score}</div>
                    </div>
                  ))}
              </div>
            </div>
          </div>

          <div className="table-card compact">
            <div className="table-title">奖惩明细</div>
            <table>
              <thead>
                <tr>
                  <th>人员</th>
                  <th>类型</th>
                  <th>事由</th>
                  <th>日期</th>
                  <th>积分</th>
                  <th>金额</th>
                  <th>凭证</th>
                </tr>
              </thead>
              <tbody>
                {rewards.map((record) => (
                  <tr key={record.id}>
                    <td>{record.name}</td>
                    <td>
                      <StatusPill
                        label={record.type}
                        tone={record.type === '奖励' ? 'good' : 'warn'}
                      />
                    </td>
                    <td>{record.reason}</td>
                    <td>{formatDate(record.date)}</td>
                    <td>{record.score}</td>
                    <td>{record.amount} 元</td>
                    <td>{record.evidence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {selectedEmployee && (
        <div className="drawer-backdrop" onClick={() => setSelectedEmployee(null)}>
          <div className="drawer" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-head">
              <div>
                <h3>{selectedEmployee.name} · 一人一档</h3>
                <p>
                  {selectedEmployee.role} · {selectedEmployee.team} · 进场日期{' '}
                  {formatDate(selectedEmployee.entryDate)}
                </p>
              </div>
              <button className="ghost-btn" onClick={() => setSelectedEmployee(null)}>
                关闭
              </button>
            </div>

            <div className="drawer-body">
              <div className="drawer-section">
                <h4>基础信息</h4>
                <div className="info-grid">
                  <div>
                    <div className="info-label">身份证号</div>
                    <div className="info-value">{selectedEmployee.idNumber}</div>
                  </div>
                  <div>
                    <div className="info-label">联系电话</div>
                    <div className="info-value">{selectedEmployee.phone}</div>
                  </div>
                  <div>
                    <div className="info-label">紧急联系人</div>
                    <div className="info-value">{selectedEmployee.emergencyContact}</div>
                  </div>
                  <div>
                    <div className="info-label">特种证书</div>
                    <div className="info-value">
                      {selectedEmployee.cert.name} · {formatDate(selectedEmployee.cert.expiry)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="drawer-section">
                <h4>行为时间轴</h4>
                <div className="timeline">
                  {selectedEmployee.timeline.map((item, index) => (
                    <div key={`${item.date}-${index}`} className="timeline-item">
                      <div className="timeline-dot" />
                      <div>
                        <div className="timeline-date">{formatDate(item.date)}</div>
                        <div className="timeline-event">{item.event}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="drawer-section">
                <h4>附件归档</h4>
                <div className="chip-list">
                  {selectedEmployee.documents.map((doc) => (
                    <span key={doc} className="chip">
                      {doc}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
