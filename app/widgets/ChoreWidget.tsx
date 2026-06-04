/**
 * Presentational widget for the ChoreQuest home-screen calendar.
 *
 * Pure render — no data access. It only knows how to draw a WidgetViewModel
 * with the react-native-android-widget primitives (FlexWidget / TextWidget /
 * ListWidget). All interactivity is expressed via `clickAction` strings that the
 * task handler (widget-task-handler.tsx) interprets.
 */
import React from 'react';
import { FlexWidget, TextWidget, ListWidget } from 'react-native-android-widget';
import type { WidgetViewModel, DayCell, WidgetTask } from './widget-data';

const C = {
  bg: '#0f0e1a',
  card: '#1a1830',
  cardDone: '#15131f',
  border: '#312e5a',
  surface3: '#252244',
  primary: '#6366f1',
  primaryLight: '#818cf8',
  primaryFaint: '#1e1b3a',
  text: '#e0e7ff',
  muted: '#94a3b8',
  dim: '#5c6278',
  success: '#22c55e',
  successBg: '#163a26',
  white: '#ffffff',
} as const;

// Click actions (mirrored in widget-task-handler.tsx).
export const ACTIONS = {
  PREV_DAY: 'PREV_DAY',
  NEXT_DAY: 'NEXT_DAY',
  GO_TODAY: 'GO_TODAY',
  REFRESH: 'REFRESH',
  SELECT_DAY: 'SELECT_DAY',
  COMPLETE: 'COMPLETE',
  OPEN_APP: 'OPEN_APP', // native: opens the app
} as const;

function HeaderButton({ glyph, action }: { glyph: string; action: string }) {
  return (
    <FlexWidget
      clickAction={action}
      style={{
        width: 30,
        height: 30,
        borderRadius: 8,
        backgroundColor: C.surface3,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <TextWidget text={glyph} style={{ fontSize: 15, color: C.primaryLight, fontWeight: '700' }} />
    </FlexWidget>
  );
}

function DayCellView({ cell }: { cell: DayCell }) {
  const numColor = cell.isToday ? C.white : cell.isSelected ? C.primaryLight : C.text;
  return (
    <FlexWidget
      clickAction={ACTIONS.SELECT_DAY}
      clickActionData={{ offset: cell.offset }}
      style={{
        flex: 1,
        height: 'wrap_content',
        marginHorizontal: 1,
        paddingVertical: 4,
        borderRadius: 10,
        flexDirection: 'column',
        alignItems: 'center',
        backgroundColor: cell.isSelected ? C.primaryFaint : '#00000000',
        borderWidth: cell.isSelected ? 1 : 0,
        borderColor: cell.isSelected ? C.primary : '#00000000',
      }}
    >
      <TextWidget text={cell.weekday} style={{ fontSize: 9, color: C.dim, fontWeight: '600' }} />
      <FlexWidget
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          marginTop: 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: cell.isToday ? C.primary : '#00000000',
        }}
      >
        <TextWidget text={cell.dayNum} style={{ fontSize: 12, color: numColor, fontWeight: cell.isToday ? '700' : '500' }} />
      </FlexWidget>
      {/* task dots */}
      <FlexWidget style={{ height: 6, marginTop: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
        {cell.dotColors.length === 0 ? (
          <TextWidget text=" " style={{ fontSize: 6, color: C.dim }} />
        ) : (
          cell.dotColors.map((color, i) => (
            <FlexWidget
              key={i}
              style={{
                width: 5,
                height: 5,
                borderRadius: 3,
                marginHorizontal: 1,
                backgroundColor: color as `#${string}`,
              }}
            />
          ))
        )}
      </FlexWidget>
    </FlexWidget>
  );
}

function TaskRow({ task }: { task: WidgetTask }) {
  const done = task.status === 'completed';
  const skipped = task.status === 'skipped';
  const inactive = done || skipped;

  return (
    <FlexWidget
      style={{
        width: 'match_parent',
        height: 'wrap_content',
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 6,
        paddingVertical: 8,
        paddingHorizontal: 8,
        borderRadius: 10,
        backgroundColor: inactive ? C.cardDone : C.card,
        borderWidth: 1,
        borderColor: C.border,
      }}
    >
      {/* Checkbox — completes a pending task; for done/skipped it just opens the app to undo. */}
      <FlexWidget
        clickAction={task.status === 'pending' ? ACTIONS.COMPLETE : ACTIONS.OPEN_APP}
        clickActionData={{ taskId: task.id }}
        style={{
          width: 26,
          height: 26,
          borderRadius: 13,
          marginRight: 8,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: done ? C.successBg : C.surface3,
          borderWidth: 1,
          borderColor: done ? C.success : C.border,
        }}
      >
        <TextWidget
          text={done ? '✓' : skipped ? '–' : ' '}
          style={{ fontSize: 14, color: done ? C.success : C.dim, fontWeight: '700' }}
        />
      </FlexWidget>

      {/* Title + meta — tapping opens the app to that task. */}
      <FlexWidget
        clickAction={ACTIONS.OPEN_APP}
        style={{ flex: 1, height: 'wrap_content', flexDirection: 'column' }}
      >
        <TextWidget
          text={`${task.icon ? task.icon + '  ' : ''}${task.title}`}
          maxLines={1}
          truncate="END"
          style={{ fontSize: 13, color: inactive ? C.dim : C.text, fontWeight: '500' }}
        />
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
          {task.assigneeName ? (
            <>
              <FlexWidget
                style={{ width: 7, height: 7, borderRadius: 4, marginRight: 4, backgroundColor: (task.assigneeColor || C.primary) as `#${string}` }}
              />
              <TextWidget text={task.assigneeName} maxLines={1} truncate="END" style={{ fontSize: 11, color: C.muted }} />
              <TextWidget text="  ·  " style={{ fontSize: 11, color: C.dim }} />
            </>
          ) : null}
          <TextWidget text={`${task.points} pt`} style={{ fontSize: 11, color: C.dim }} />
        </FlexWidget>
      </FlexWidget>
    </FlexWidget>
  );
}

function LoggedOut() {
  return (
    <FlexWidget
      clickAction={ACTIONS.OPEN_APP}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: C.bg,
        borderRadius: 16,
        padding: 16,
      }}
    >
      <TextWidget text="🧹" style={{ fontSize: 28 }} />
      <TextWidget text="ChoreQuest" style={{ fontSize: 16, color: C.text, fontWeight: '700', marginTop: 6 }} />
      <TextWidget text="Tap to log in" style={{ fontSize: 12, color: C.muted, marginTop: 2 }} />
    </FlexWidget>
  );
}

export function ChoreWidget({ vm }: { vm: WidgetViewModel }) {
  if (!vm.loggedIn) return <LoggedOut />;

  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        backgroundColor: C.bg,
        borderRadius: 16,
        padding: 10,
      }}
    >
      {/* Header: date + nav + refresh */}
      <FlexWidget style={{ width: 'match_parent', height: 'wrap_content', flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
        <FlexWidget clickAction={ACTIONS.OPEN_APP} style={{ flex: 1, height: 'wrap_content', flexDirection: 'column' }}>
          <TextWidget text={vm.dateLabel} style={{ fontSize: 15, color: C.white, fontWeight: '700' }} />
          <TextWidget
            text={
              vm.totalCount === 0
                ? (vm.error ? 'Tap to open' : vm.stale ? 'Offline · cached' : 'No chores')
                : `${vm.doneCount}/${vm.totalCount} done${vm.stale ? '  ·  cached' : ''}`
            }
            style={{ fontSize: 11, color: vm.error ? '#ef4444' : C.muted, marginTop: 1 }}
          />
        </FlexWidget>
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
          <HeaderButton glyph={'‹'} action={ACTIONS.PREV_DAY} />
          <FlexWidget style={{ width: 4 }} />
          <FlexWidget
            clickAction={ACTIONS.GO_TODAY}
            style={{ height: 30, paddingHorizontal: 10, borderRadius: 8, backgroundColor: vm.dayOffset === 0 ? C.primary : C.surface3, alignItems: 'center', justifyContent: 'center' }}
          >
            <TextWidget text="Today" style={{ fontSize: 11, color: vm.dayOffset === 0 ? C.white : C.primaryLight, fontWeight: '600' }} />
          </FlexWidget>
          <FlexWidget style={{ width: 4 }} />
          <HeaderButton glyph={'›'} action={ACTIONS.NEXT_DAY} />
          <FlexWidget style={{ width: 4 }} />
          <HeaderButton glyph={'↻'} action={ACTIONS.REFRESH} />
        </FlexWidget>
      </FlexWidget>

      {/* Week strip */}
      <FlexWidget style={{ width: 'match_parent', height: 'wrap_content', flexDirection: 'row', marginBottom: 8 }}>
        {vm.week.map((cell) => (
          <DayCellView key={cell.key} cell={cell} />
        ))}
      </FlexWidget>

      {/* Agenda for the selected day */}
      {vm.tasks.length === 0 ? (
        <FlexWidget
          clickAction={ACTIONS.OPEN_APP}
          style={{ flex: 1, width: 'match_parent', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
        >
          <TextWidget text={vm.dayOffset === 0 ? '🎉' : '📅'} style={{ fontSize: 24 }} />
          <TextWidget
            text={vm.dayOffset === 0 ? 'All clear today!' : 'Nothing scheduled'}
            style={{ fontSize: 12, color: C.muted, marginTop: 4 }}
          />
        </FlexWidget>
      ) : (
        <ListWidget style={{ height: 'match_parent', width: 'match_parent' }}>
          {vm.tasks.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </ListWidget>
      )}
    </FlexWidget>
  );
}
