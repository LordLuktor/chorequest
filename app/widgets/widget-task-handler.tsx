/**
 * Headless task handler for the ChoreCalendar widget.
 *
 * Android invokes this (via the AppRegistry headless task registered in
 * index.js) whenever the widget is added, periodically refreshed, resized, or
 * clicked. We translate the action into a data operation and re-render.
 *
 * The handler must never throw — an unhandled rejection here would leave the
 * widget blank. All data calls are already defensive; we wrap render anyway.
 */
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { ACTIONS } from './ChoreWidget';
import { renderChoreWidget } from './render';
import {
  getDayOffset, setDayOffset, completeTask,
} from './widget-data';

export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  const { widgetAction, clickAction, clickActionData, renderWidget } = props;

  const draw = async (forceRefresh: boolean) => {
    try {
      renderWidget(await renderChoreWidget(forceRefresh));
    } catch {
      // Swallow — leaving the previous frame up is better than crashing.
    }
  };

  switch (widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
      await draw(true); // fetch fresh on add / periodic update
      return;

    case 'WIDGET_RESIZED':
      await draw(false); // just relayout from cache
      return;

    case 'WIDGET_DELETED':
      return; // nothing to draw

    case 'WIDGET_CLICK':
      await handleClick(clickAction, clickActionData, draw);
      return;

    default:
      await draw(false);
  }
}

async function handleClick(
  clickAction: string | undefined,
  data: Record<string, unknown> | undefined,
  draw: (forceRefresh: boolean) => Promise<void>,
): Promise<void> {
  switch (clickAction) {
    case ACTIONS.PREV_DAY: {
      await setDayOffset((await getDayOffset()) - 1);
      await draw(false); // navigate within cached week — no network
      return;
    }
    case ACTIONS.NEXT_DAY: {
      await setDayOffset((await getDayOffset()) + 1);
      await draw(false);
      return;
    }
    case ACTIONS.GO_TODAY: {
      await setDayOffset(0);
      await draw(false);
      return;
    }
    case ACTIONS.SELECT_DAY: {
      const offset = typeof data?.offset === 'number' ? data.offset : 0;
      await setDayOffset(offset);
      await draw(false);
      return;
    }
    case ACTIONS.COMPLETE: {
      const taskId = typeof data?.taskId === 'number' ? data.taskId : Number(data?.taskId);
      if (Number.isFinite(taskId)) {
        await completeTask(taskId); // optimistic + server sync inside
      }
      await draw(false); // cache already reflects the change
      return;
    }
    case ACTIONS.REFRESH: {
      await draw(true);
      return;
    }
    // ACTIONS.OPEN_APP is handled natively (no JS round-trip).
    default:
      await draw(false);
  }
}
