import { useEffect, useMemo, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, WheelEvent } from 'react';
import styles from './OutlineView.module.css';

type FocusType = 'line' | 'slice' | 'segment';
type SplitterType = 'left' | 'right' | 'bottom';

interface FocusState {
  type: FocusType;
  id: string;
  title: string;
}

interface PanState {
  x: number;
  y: number;
}

interface PanDragState {
  startX: number;
  startY: number;
  panX: number;
  panY: number;
}

interface OutlineLine {
  id: string;
  name: string;
  type: string;
  color: string;
}

interface ScenarioSlice {
  id: string;
  title: string;
  meta: string;
}

interface MockScenario {
  id: string;
  label: string;
  notes: string;
  lines: OutlineLine[];
  beforeSlices: readonly ScenarioSlice[];
  afterSlice: ScenarioSlice;
  junctions: Array<{
    id: string;
    title: string;
    lineIds: string[];
    segmentSlices: readonly ScenarioSlice[];
    desiredX: number;
  }>;
}

const floatingSlices = ['迷雾中的旧誓言', '神殿门前的低语', '遗失的王印'];
const orphanageSlices = ['风暴前夜', '守林人之谜'];
const trashSlices = ['废弃线索 A'];

const mockScenarios: MockScenario[] = [
  {
    id: 'adjacent-3',
    label: '三线相邻交汇',
    notes: '3 条相邻线汇入同一段后回到各线',
    lines: [
      { id: 'line-main-a', name: '命运之轮', type: 'MAIN', color: '#5b7cf6' },
      { id: 'line-main-b', name: '血脉传承', type: 'MAIN', color: '#e05c7f' },
      { id: 'line-branch-a', name: '沈晚儿视角', type: '支', color: '#44c9a4' },
      { id: 'line-side-a', name: '审判庭线', type: '支', color: '#c38cff' },
    ],
    beforeSlices: [
      { id: 'slice-1', title: '序章', meta: '第一纪元 · 北境' },
      { id: 'slice-2', title: '血契', meta: '第一纪元 · 神殿' },
    ],
    afterSlice: { id: 'slice-5', title: '余波', meta: '第二纪元 · 边境' },
    junctions: [
      {
        id: 'seg-01',
        title: 'SEG-01',
        lineIds: ['line-main-a', 'line-main-b', 'line-branch-a'],
        segmentSlices: [
          { id: 'slice-3', title: '初次交锋', meta: '第二纪元 · 王城' },
          { id: 'slice-4', title: '真相浮现', meta: '第二纪元 · 王城' },
        ],
        desiredX: 600,
      },
    ],
  },
  {
    id: 'non-adjacent-2',
    label: '两线非相邻交汇',
    notes: '第 1/4 线跨层交汇，测试非相邻避让',
    lines: [
      { id: 'line-main-a', name: '命运之轮', type: 'MAIN', color: '#5b7cf6' },
      { id: 'line-main-b', name: '血脉传承', type: 'MAIN', color: '#e05c7f' },
      { id: 'line-branch-a', name: '沈晚儿视角', type: '支', color: '#44c9a4' },
      { id: 'line-side-a', name: '审判庭线', type: '支', color: '#c38cff' },
    ],
    beforeSlices: [
      { id: 'slice-1', title: '埋线', meta: '第一纪元 · 北境' },
      { id: 'slice-2', title: '会合前夜', meta: '第一纪元 · 神殿' },
    ],
    afterSlice: { id: 'slice-5', title: '各返阵营', meta: '第二纪元 · 边境' },
    junctions: [
      {
        id: 'seg-02',
        title: 'SEG-02',
        lineIds: ['line-main-a', 'line-side-a'],
        segmentSlices: [
          { id: 'slice-3', title: '塔顶对峙', meta: '第二纪元 · 王城' },
          { id: 'slice-4', title: '互换情报', meta: '第二纪元 · 王城' },
          { id: 'slice-6', title: '背刺伏笔', meta: '第二纪元 · 王城' },
        ],
        desiredX: 590,
      },
    ],
  },
  {
    id: 'four-lines',
    label: '四线交汇',
    notes: '4 条线同段交汇，自动拉大间隙容纳容器',
    lines: [
      { id: 'line-main-a', name: '命运之轮', type: 'MAIN', color: '#5b7cf6' },
      { id: 'line-main-b', name: '血脉传承', type: 'MAIN', color: '#e05c7f' },
      { id: 'line-branch-a', name: '沈晚儿视角', type: '支', color: '#44c9a4' },
      { id: 'line-side-a', name: '审判庭线', type: '支', color: '#c38cff' },
      { id: 'line-side-b', name: '远征军线', type: '支', color: '#f2a65a' },
    ],
    beforeSlices: [
      { id: 'slice-1', title: '分头推进', meta: '第一纪元 · 多地' },
      { id: 'slice-2', title: '同步集结', meta: '第一纪元 · 王城' },
    ],
    afterSlice: { id: 'slice-5', title: '分线余波', meta: '第二纪元 · 边境' },
    junctions: [
      {
        id: 'seg-03',
        title: 'SEG-03',
        lineIds: ['line-main-a', 'line-main-b', 'line-branch-a', 'line-side-a'],
        segmentSlices: [
          { id: 'slice-3', title: '群像冲突', meta: '第二纪元 · 王城' },
          { id: 'slice-4', title: '叙事交接', meta: '第二纪元 · 王城' },
          { id: 'slice-6', title: '视角跳切', meta: '第二纪元 · 王城' },
        ],
        desiredX: 610,
      },
    ],
  },
  {
    id: 'multi-junctions',
    label: '多交汇并存',
    notes: '多交汇段同时存在，测试自动选位与避让',
    lines: [
      { id: 'line-main-a', name: '命运之轮', type: 'MAIN', color: '#5b7cf6' },
      { id: 'line-main-b', name: '血脉传承', type: 'MAIN', color: '#e05c7f' },
      { id: 'line-branch-a', name: '沈晚儿视角', type: '支', color: '#44c9a4' },
      { id: 'line-side-a', name: '审判庭线', type: '支', color: '#c38cff' },
      { id: 'line-side-b', name: '远征军线', type: '支', color: '#f2a65a' },
    ],
    beforeSlices: [
      { id: 'slice-1', title: '多线并行', meta: '第一纪元 · 多地' },
      { id: 'slice-2', title: '相位对齐', meta: '第一纪元 · 王城' },
    ],
    afterSlice: { id: 'slice-5', title: '回归支线', meta: '第二纪元 · 各地' },
    junctions: [
      {
        id: 'seg-11',
        title: 'SEG-11',
        lineIds: ['line-main-a', 'line-main-b', 'line-branch-a'],
        segmentSlices: [
          { id: 'slice-11', title: '三线争执', meta: '第二纪元 · 王城' },
          { id: 'slice-12', title: '密令转交', meta: '第二纪元 · 王城' },
        ],
        desiredX: 600,
      },
      {
        id: 'seg-12',
        title: 'SEG-12',
        lineIds: ['line-main-a', 'line-side-b'],
        segmentSlices: [
          { id: 'slice-13', title: '边境会晤', meta: '第三纪元 · 边境' },
          { id: 'slice-14', title: '暗号对接', meta: '第三纪元 · 边境' },
          { id: 'slice-15', title: '临时联盟', meta: '第三纪元 · 边境' },
        ],
        desiredX: 640,
      },
      {
        id: 'seg-13',
        title: 'SEG-13',
        lineIds: ['line-main-b', 'line-side-a', 'line-side-b'],
        segmentSlices: [{ id: 'slice-16', title: '局势反转', meta: '第三纪元 · 王城' }],
        desiredX: 680,
      },
    ],
  },
];

const layout = {
  labelX: 30,
  preAX: 240,
  preBX: 360,
  branchInputX: 460,
  mergeX: 580,
  allBaseY: 58,
  focusBaseY: 58,
} as const;

function clampZoom(value: number) {
  return Math.min(400, Math.max(25, value));
}

const ALL_VIEW_ZOOM_THRESHOLD = 78;
const FOCUS_VIEW_ZOOM_THRESHOLD = 128;

export function OutlineView() {
  const [scenarioId, setScenarioId] = useState(mockScenarios[0].id);
  const scenario = useMemo(() => mockScenarios.find((item) => item.id === scenarioId) ?? mockScenarios[0], [scenarioId]);

  const lines = scenario.lines;
  const beforeSlices = scenario.beforeSlices;
  const junctions = scenario.junctions;
  const primaryJunction = junctions[0];
  const segmentSlices = primaryJunction.segmentSlices;
  const afterSlice = scenario.afterSlice;

  const [leftWidth, setLeftWidth] = useState(220);
  const [rightWidth, setRightWidth] = useState(300);
  const [editHeight, setEditHeight] = useState(220);
  const [zoom, setZoom] = useState(84);
  const [viewMode, setViewMode] = useState<'all' | 'focus'>('focus');
  const [activeLineId, setActiveLineId] = useState(lines[0].id);
  const [focus, setFocus] = useState<FocusState | null>(null);
  const [pan, setPan] = useState<PanState>({ x: 0, y: 0 });
  const [panDrag, setPanDrag] = useState<PanDragState | null>(null);

  const rightOpen = Boolean(focus);
  const participantSet = useMemo(() => new Set(primaryJunction.lineIds), [primaryJunction.lineIds]);
  const allStepY = Math.max(56, 44 + segmentSlices.length * 6);
  const focusStepY = Math.max(88, 72 + segmentSlices.length * 10);
  const allBranchY = lines.map((_, index) => layout.allBaseY + index * allStepY);
  const focusBranchY = lines.map((_, index) => layout.focusBaseY + index * focusStepY);
  const participantAllY = allBranchY.filter((_, index) => participantSet.has(lines[index].id));
  const participantFocusY = focusBranchY.filter((_, index) => participantSet.has(lines[index].id));
  const allMergeY = participantAllY.reduce((sum, y) => sum + y, 0) / Math.max(participantAllY.length, 1);
  const focusMergeY = participantFocusY.reduce((sum, y) => sum + y, 0) / Math.max(participantFocusY.length, 1);

  const primaryJunctionWidth = Math.max(220, 140 + segmentSlices.length * 92);
  const primaryJunctionLeftX = layout.mergeX + 22;
  const primaryJunctionRightX = primaryJunctionLeftX + primaryJunctionWidth;

  const junctionPills = useMemo(() => {
    const minGap = 14;
    return junctions
      .slice()
      .sort((a, b) => a.desiredX - b.desiredX)
      .reduce<
        Array<{
          id: string;
          title: string;
          lineIds: string[];
          segmentSlices: readonly ScenarioSlice[];
          desiredX: number;
          x: number;
          width: number;
        }>
      >((acc, item) => {
        const width = Math.max(116, 74 + item.segmentSlices.length * 22);
        const previous = acc[acc.length - 1];
        const cursor = previous ? previous.x + previous.width + minGap : primaryJunctionLeftX;
        const x = Math.max(item.desiredX, cursor);
        return [...acc, { ...item, x, width }];
      }, []);
  }, [junctions, primaryJunctionLeftX]);

  const junctionRailEnd = Math.max(primaryJunctionRightX, ...junctionPills.map((item) => item.x + item.width));
  const splitX = junctionRailEnd + 34;
  const afterNodeX = splitX + 140;
  const trunkEndX = afterNodeX + 80;
  const sceneWidth = trunkEndX + 120;
  const allGraphHeight = Math.max(...allBranchY) + 170;
  const focusGraphHeight = Math.max(...focusBranchY) + 190;
  const sceneMinHeight = Math.max(allGraphHeight, focusGraphHeight) + 30;
  const useFocusJunctionChain = junctions.length > 1;

  const activeLine = lines.find((line) => line.id === activeLineId) ?? lines[0];
  const syncViewModeByZoom = (nextZoom: number) => {
    if (nextZoom <= ALL_VIEW_ZOOM_THRESHOLD) {
      setViewMode('all');
      return;
    }
    if (nextZoom >= FOCUS_VIEW_ZOOM_THRESHOLD) {
      setViewMode('focus');
    }
  };

  const handleSwitchAllView = () => setZoomWithSync(ALL_VIEW_ZOOM_THRESHOLD);
  const handleSwitchFocusView = () => setZoomWithSync(FOCUS_VIEW_ZOOM_THRESHOLD);

  const setZoomWithSync = (nextZoom: number) => {
    const normalized = clampZoom(nextZoom);
    setZoom(normalized);
    syncViewModeByZoom(normalized);
  };

  const handleZoomIn = () => setZoomWithSync(zoom + 10);
  const handleZoomOut = () => setZoomWithSync(zoom - 10);
  const handleZoomReset = () => {
    setPan({ x: 0, y: 0 });
    setZoomWithSync(100);
  };

  const handleCanvasWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const step = event.ctrlKey ? 8 : 14;
    const direction = event.deltaY > 0 ? -1 : 1;
    setZoomWithSync(zoom + direction * step);
  };

  const setSplitter = (type: SplitterType, delta: number) => {
    if (type === 'left') {
      setLeftWidth((prev) => Math.min(360, Math.max(180, prev + delta)));
      return;
    }
    if (type === 'right') {
      setRightWidth((prev) => Math.min(420, Math.max(260, prev - delta)));
      return;
    }
    setEditHeight((prev) => Math.min(360, Math.max(180, prev - delta)));
  };

  const startDrag = (type: SplitterType, clientX: number, clientY: number) => {
    const startX = clientX;
    const startY = clientY;

    const onMove = (event: MouseEvent) => {
      const delta = type === 'bottom' ? event.clientY - startY : event.clientX - startX;
      setSplitter(type, delta);
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleCanvasPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest('button')) {
      return;
    }

    setPanDrag({
      startX: event.clientX,
      startY: event.clientY,
      panX: pan.x,
      panY: pan.y,
    });
  };

  useEffect(() => {
    if (!panDrag) {
      return;
    }

    const onMove = (event: MouseEvent) => {
      setPan({
        x: panDrag.panX + (event.clientX - panDrag.startX),
        y: panDrag.panY + (event.clientY - panDrag.startY),
      });
    };

    const onUp = () => setPanDrag(null);

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [panDrag]);

  const rightTitle = useMemo(() => {
    if (!focus) {
      return '未选择对象';
    }
    if (focus.type === 'line') {
      return `故事线 · ${focus.title}`;
    }
    if (focus.type === 'segment') {
      return `⇌ 交汇段 · ${focus.title}`;
    }
    return `切片 · ${focus.title}`;
  }, [focus]);

  return (
    <div className={styles.page}>
      <header className={styles.topBar}>
        <div className={styles.topLeft}>
          <span className={styles.brand}>NARRATIVE OS</span>
          <button type="button" className={styles.activeLineBtn}>
            <span className={styles.lineDot} style={{ backgroundColor: activeLine.color }} />
            <span>{activeLine.name}</span>
            <span className={styles.lineType}>{activeLine.type}</span>
          </button>
          <span className={styles.divider}>|</span>
          <button type="button" className={styles.iconBtn}>↩</button>
          <button type="button" className={styles.iconBtn}>↪</button>
          <div className={styles.tabs}>
            <button type="button" className={`${styles.tab} ${styles.tabActive}`}>大纲</button>
            <button type="button" className={styles.tab}>设定卡</button>
            <button type="button" className={styles.tab}>版本</button>
          </div>
        </div>
        <h1 className={styles.projectTitle}>苍穹之战 · 第一卷草稿</h1>
        <div className={styles.topRight}>
          <button type="button" className={styles.primaryBtn}>+ 新建主线</button>
          <button type="button" className={styles.secondaryBtn}>保存版本</button>
          <button type="button" className={styles.iconBtn}>⋯</button>
        </div>
      </header>

      <div className={styles.mainArea}>
        <aside className={styles.leftPanel} style={{ width: `${leftWidth}px` }}>
          <section className={styles.section}>
            <div className={styles.sectionHeader}><span>游离区</span><span>{floatingSlices.length}</span></div>
            {floatingSlices.map((item) => (
              <button type="button" key={item} className={styles.listItem} onClick={() => setFocus({ type: 'slice', id: item, title: item })}>
                ◌ {item}
              </button>
            ))}
          </section>
          <section className={styles.section}>
            <div className={styles.sectionHeader}><span>保留区</span><span>{orphanageSlices.length}</span></div>
            {orphanageSlices.map((item) => (
              <button type="button" key={item} className={styles.listItem} onClick={() => setFocus({ type: 'slice', id: item, title: item })}>
                ◎ {item}
              </button>
            ))}
          </section>
          <section className={styles.section}>
            <div className={styles.sectionHeader}><span>回收站</span><span>{trashSlices.length}</span></div>
            {trashSlices.map((item) => (
              <button type="button" key={item} className={styles.listItem} onClick={() => setFocus({ type: 'slice', id: item, title: item })}>
                ⊖ {item}
              </button>
            ))}
          </section>
        </aside>

        <button type="button" className={styles.verticalSplitter} onMouseDown={(event) => startDrag('left', event.clientX, event.clientY)} aria-label="调整左栏宽度" />

        <section className={styles.canvasArea}>
          <div className={styles.canvasToolbar}>
            <div className={styles.toolbarGroup}>
              <button type="button" className={`${styles.smallBtn} ${viewMode === 'all' ? styles.smallBtnActive : ''}`} onClick={handleSwitchAllView}>全知</button>
              <button type="button" className={`${styles.smallBtn} ${viewMode === 'focus' ? styles.smallBtnActive : ''}`} onClick={handleSwitchFocusView}>聚焦</button>
            </div>
            <div className={styles.scenarioGroup}>
              {mockScenarios.map((mock) => (
                <button
                  key={mock.id}
                  type="button"
                  className={`${styles.smallBtn} ${scenarioId === mock.id ? styles.smallBtnActive : ''}`}
                  onClick={() => setScenarioId(mock.id)}
                  title={mock.notes}
                >
                  {mock.label}
                </button>
              ))}
            </div>
            <div className={styles.toolbarGroup}>
              <button type="button" className={styles.smallBtn} onClick={handleZoomReset}>适应窗口</button>
              <button type="button" className={styles.smallBtn} onClick={handleZoomReset}>100%</button>
              <button type="button" className={styles.smallBtn} onClick={handleZoomOut}>-</button>
              <button type="button" className={styles.smallBtn} onClick={handleZoomIn}>+</button>
              <span className={styles.zoomLabel}>{zoom}%</span>
            </div>
          </div>

          <div className={`${styles.canvas} ${panDrag ? styles.canvasPanning : ''}`} onWheel={handleCanvasWheel} onPointerDown={handleCanvasPointerDown}>
            <span className={styles.canvasHint}>滚轮缩放 · 拖动画布</span>

            <div
              className={styles.scene}
              style={{ width: `${sceneWidth}px`, minHeight: `${sceneMinHeight}px`, transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom / 100})` }}
            >
              {viewMode === 'all' ? (
                <div className={styles.sourceTreeView} style={{ height: `${allGraphHeight}px` }}>
                  <svg className={styles.sourceTreeLines} viewBox={`0 0 ${sceneWidth} ${allGraphHeight}`} aria-hidden="true">
                    <title>全知视角关系图</title>
                    {lines.map((line, index) => (
                      <g key={`${line.id}-all-path`}>
                        <path d={`M ${layout.preAX} ${allBranchY[index]} L ${layout.preBX} ${allBranchY[index]}`} stroke={line.color} strokeWidth="2" fill="none" />
                        {participantSet.has(line.id) ? (
                          <>
                            <path d={`M ${layout.preBX} ${allBranchY[index]} C 410 ${allBranchY[index]} 430 ${allMergeY} ${layout.mergeX} ${allMergeY}`} stroke={line.color} strokeWidth="2" fill="none" />
                            <path d={`M ${splitX} ${allMergeY} C ${splitX + 30} ${allMergeY} ${splitX + 40} ${allBranchY[index]} ${afterNodeX} ${allBranchY[index]}`} stroke={line.color} strokeWidth="2" fill="none" />
                          </>
                        ) : (
                          <path d={`M ${layout.preBX} ${allBranchY[index]} L ${trunkEndX} ${allBranchY[index]}`} stroke={line.color} strokeWidth="2" fill="none" />
                        )}
                        <path d={`M ${afterNodeX} ${allBranchY[index]} L ${trunkEndX} ${allBranchY[index]}`} stroke={line.color} strokeWidth="2" fill="none" />
                      </g>
                    ))}
                    <path d={`M ${layout.mergeX} ${allMergeY} L ${splitX} ${allMergeY}`} stroke="#9aa0b3" strokeWidth="2" fill="none" />
                  </svg>

                  {lines.map((line, index) => (
                    <button
                      key={`${line.id}-all-label`}
                      type="button"
                      className={styles.graphLineLabel}
                      style={{ top: `${allBranchY[index] - 16}px`, borderColor: line.color }}
                      onClick={() => {
                        setActiveLineId(line.id);
                        setFocus({ type: 'line', id: line.id, title: line.name });
                      }}
                    >
                      <span className={styles.lineDot} style={{ backgroundColor: line.color }} />
                      <span>{line.name}</span>
                    </button>
                  ))}

                  {junctionPills.map((item) => (
                    <button
                      key={`${item.id}-all-pill`}
                      type="button"
                      className={styles.segmentPillInline}
                      style={{ left: `${item.x}px`, top: `${allMergeY}px`, width: `${item.width}px` }}
                      onClick={() => setFocus({ type: 'segment', id: item.id, title: item.title })}
                    >
                      {item.title}
                    </button>
                  ))}

                  {lines.map((line, index) => (
                    <button
                      key={`${line.id}-all-a`}
                      type="button"
                      className={styles.graphNode}
                      style={{ left: `${layout.preAX}px`, top: `${allBranchY[index]}px`, borderColor: line.color }}
                      onClick={() => setFocus({ type: 'slice', id: `${line.id}-${beforeSlices[0].id}`, title: beforeSlices[0].title })}
                      aria-label={`${line.name}-${beforeSlices[0].title}`}
                    />
                  ))}

                  {lines.map((line, index) => (
                    <button
                      key={`${line.id}-all-b`}
                      type="button"
                      className={styles.graphNode}
                      style={{ left: `${layout.preBX}px`, top: `${allBranchY[index]}px`, borderColor: line.color }}
                      onClick={() => setFocus({ type: 'slice', id: `${line.id}-${beforeSlices[1].id}`, title: beforeSlices[1].title })}
                      aria-label={`${line.name}-${beforeSlices[1].title}`}
                    />
                  ))}

                  {lines.map((line, index) => (
                    <button
                      key={`${line.id}-all-after`}
                      type="button"
                      className={styles.graphNode}
                      style={{ left: `${afterNodeX}px`, top: `${allBranchY[index]}px`, borderColor: line.color }}
                      onClick={() => setFocus({ type: 'slice', id: `${line.id}-${afterSlice.id}`, title: afterSlice.title })}
                      aria-label={`${line.name}-${afterSlice.title}`}
                    />
                  ))}
                </div>
              ) : (
                <div className={styles.focusMergedView} style={{ height: `${focusGraphHeight}px` }}>
                  <svg className={styles.focusMergeLines} viewBox={`0 0 ${sceneWidth} ${focusGraphHeight}`} aria-hidden="true">
                    <title>聚焦视角合并关系图</title>
                    {lines.map((line, index) => (
                      <g key={`${line.id}-focus-path`}>
                        <path d={`M ${layout.preAX} ${focusBranchY[index]} L ${layout.preBX} ${focusBranchY[index]}`} stroke={line.color} strokeWidth="2" fill="none" />
                        {participantSet.has(line.id) ? (
                          <>
                            <path d={`M ${layout.preBX} ${focusBranchY[index]} L ${layout.branchInputX} ${focusBranchY[index]}`} stroke={line.color} strokeWidth="2" fill="none" />
                            <path d={`M ${layout.branchInputX} ${focusBranchY[index]} C 530 ${focusBranchY[index]} 548 ${focusMergeY} ${layout.mergeX} ${focusMergeY}`} stroke={line.color} strokeWidth="2" fill="none" />
                            <path d={`M ${splitX} ${focusMergeY} C ${splitX + 30} ${focusMergeY} ${splitX + 42} ${focusBranchY[index]} ${afterNodeX} ${focusBranchY[index]}`} stroke={line.color} strokeWidth="2" fill="none" />
                          </>
                        ) : (
                          <path d={`M ${layout.preBX} ${focusBranchY[index]} L ${trunkEndX} ${focusBranchY[index]}`} stroke={line.color} strokeWidth="2" fill="none" />
                        )}
                        <path d={`M ${afterNodeX} ${focusBranchY[index]} L ${trunkEndX} ${focusBranchY[index]}`} stroke={line.color} strokeWidth="2" fill="none" />
                      </g>
                    ))}
                    <path d={`M ${layout.mergeX} ${focusMergeY} L ${splitX} ${focusMergeY}`} stroke="#9aa0b3" strokeWidth="2" fill="none" />
                  </svg>

                  {lines.map((line, index) => (
                    <button
                      key={`${line.id}-focus-label`}
                      type="button"
                      className={styles.graphLineLabel}
                      style={{ top: `${focusBranchY[index] - 16}px`, borderColor: line.color }}
                      onClick={() => {
                        setActiveLineId(line.id);
                        setFocus({ type: 'line', id: line.id, title: line.name });
                      }}
                    >
                      <span className={styles.lineDot} style={{ backgroundColor: line.color }} />
                      <span>{line.name}</span>
                    </button>
                  ))}

                  {lines.map((line, index) => (
                    <button
                      key={`${line.id}-focus-card-a`}
                      type="button"
                      className={styles.graphCard}
                      style={{ left: `${layout.preAX - 54}px`, top: `${focusBranchY[index] - 33}px` }}
                      onClick={() => setFocus({ type: 'slice', id: `${line.id}-${beforeSlices[0].id}`, title: beforeSlices[0].title })}
                    >
                      <span className={styles.sliceTitle}>{beforeSlices[0].title}</span>
                      <span className={styles.sliceMeta}>{beforeSlices[0].meta}</span>
                    </button>
                  ))}

                  {lines.map((line, index) => (
                    <button
                      key={`${line.id}-focus-card-b`}
                      type="button"
                      className={styles.graphCard}
                      style={{ left: `${layout.preBX - 54}px`, top: `${focusBranchY[index] - 33}px` }}
                      onClick={() => setFocus({ type: 'slice', id: `${line.id}-${beforeSlices[1].id}`, title: beforeSlices[1].title })}
                    >
                      <span className={styles.sliceTitle}>{beforeSlices[1].title}</span>
                      <span className={styles.sliceMeta}>{beforeSlices[1].meta}</span>
                    </button>
                  ))}

                  {useFocusJunctionChain ? (
                    junctionPills.map((item) => (
                      <button
                        key={`${item.id}-focus-pill`}
                        type="button"
                        className={styles.segmentPillInline}
                        style={{ left: `${item.x}px`, top: `${focusMergeY}px`, width: `${item.width}px` }}
                        onClick={() => setFocus({ type: 'segment', id: item.id, title: item.title })}
                      >
                        {item.title}
                      </button>
                    ))
                  ) : (
                    <div
                      className={styles.segmentContainerInline}
                      style={{ left: `${primaryJunctionLeftX}px`, top: `${focusMergeY}px`, width: `${primaryJunctionWidth}px` }}
                    >
                      <button
                        type="button"
                        className={styles.segmentBadge}
                        onClick={() => setFocus({ type: 'segment', id: primaryJunction.id, title: primaryJunction.title })}
                      >
                        JUNCTION · {primaryJunction.title}（共享）
                      </button>
                      <div className={styles.segmentChildren}>
                        {segmentSlices.map((slice) => (
                          <button
                            key={`${slice.id}-focus-segment`}
                            type="button"
                            className={styles.segmentChildCard}
                            onClick={() => setFocus({ type: 'slice', id: `seg-${slice.id}`, title: slice.title })}
                          >
                            <span className={styles.sliceTitle}>{slice.title}</span>
                            <span className={styles.sliceMeta}>{slice.meta}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {lines.map((line, index) => (
                    <button
                      key={`${line.id}-focus-after`}
                      type="button"
                      className={styles.graphCard}
                      style={{ left: `${afterNodeX - 54}px`, top: `${focusBranchY[index] - 33}px` }}
                      onClick={() => setFocus({ type: 'slice', id: `${line.id}-${afterSlice.id}`, title: afterSlice.title })}
                    >
                      <span className={styles.sliceTitle}>{afterSlice.title}</span>
                      <span className={styles.sliceMeta}>{afterSlice.meta}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        <button type="button" className={styles.verticalSplitter} onMouseDown={(event) => startDrag('right', event.clientX, event.clientY)} aria-label="调整右栏宽度" />

        <aside className={`${styles.rightPanel} ${rightOpen ? styles.rightPanelOpen : ''}`} style={{ width: `${rightWidth}px` }}>
          <header className={styles.rightHeader}>
            <h2>{rightTitle}</h2>
            <button type="button" className={styles.iconBtn} onClick={() => setFocus(null)}>×</button>
          </header>
          <div className={styles.rightTabs}>
            <button type="button" className={`${styles.tab} ${styles.tabActive}`}>信息</button>
            <button type="button" className={styles.tab}>结构操作</button>
            <button type="button" className={styles.tab}>设定卡</button>
          </div>
          <div className={styles.rightContent}>
            <p>当前对象：{focus?.title ?? '无'}</p>
            <p>共享段切片：{segmentSlices.map((slice) => slice.title).join(' / ')}</p>
            <p>场景说明：{scenario.notes}</p>
          </div>
        </aside>
      </div>

      <button type="button" className={styles.horizontalSplitter} onMouseDown={(event) => startDrag('bottom', event.clientX, event.clientY)} aria-label="调整下方编辑区高度" />

      <section className={styles.editZone} style={{ height: `${editHeight}px` }}>
        <header className={styles.editHeader}>
          <strong>● {activeLine.name}</strong>
          <span>[编辑中]</span>
          <span>8 切片</span>
        </header>
        <div className={styles.editTools}>
          <button type="button" className={styles.smallBtn}>+ 新建切片</button>
          <button type="button" className={styles.smallBtn}>⇌ 新建交汇段</button>
          <button type="button" className={styles.smallBtn}>→⊕ 接入交汇段</button>
          <span className={styles.dragHint}>拖拽重排</span>
        </div>
        <div className={styles.timeline}>
          {[...beforeSlices, ...segmentSlices, afterSlice].map((slice) => (
            <div key={`timeline-${slice.id}`} className={styles.timelineCard}>{slice.title}</div>
          ))}
          <div className={styles.timelineSegment}>{primaryJunction.title}（共享）</div>
          <button type="button" className={styles.timelineAdd}>＋</button>
        </div>
      </section>

      <footer className={styles.bottomStatus}>草稿已同步 · 3 条故事线 · 8 切片 · 1 交汇段</footer>
    </div>
  );
}
