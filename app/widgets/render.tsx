/**
 * Shared render helper used by both the headless task handler and the
 * app-side bridge (lib/widget-bridge.ts), so the widget is built the same way
 * no matter what triggers the draw.
 */
import React from 'react';
import { ChoreWidget } from './ChoreWidget';
import { buildViewModel } from './widget-data';

/** Build the current view-model and return the widget element. */
export async function renderChoreWidget(forceRefresh: boolean) {
  const vm = await buildViewModel(forceRefresh);
  return <ChoreWidget vm={vm} />;
}

export const CHORE_WIDGET_NAME = 'ChoreCalendar';
