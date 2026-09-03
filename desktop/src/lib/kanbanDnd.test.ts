import { describe, expect, it } from 'vitest';
import type { Application } from '../api';
import { DRAG_THRESHOLD_PX, beginDrag, dropStatusAt, moveDrag, resolveDrop, startsDragFrom } from './kanbanDnd';

function app(over: Partial<Application>): Application {
  return {
    number: 1, date: '', company: 'X', role: 'Dev', status: 'Evaluated', normStatus: 'evaluated', statusPriority: 5,
    score: 3, scoreRaw: '3.0/5', hasPdf: false, pdfPath: '', coverLetterPath: '', reportPath: '', reportNumber: '001',
    notes: '', jobUrl: '', archetype: '', tldr: '', remote: '', compEstimate: '', ...over,
  };
}

/** Minimal stand-in for a DOM element: only `closest` is consulted. */
function fakeElement({ dropStatus = null, insideControl = false }: { dropStatus?: string | null; insideControl?: boolean }): Element {
  return {
    closest(selector: string) {
      if (selector === '[data-drop-status]') {
        return dropStatus === null ? null : { getAttribute: () => dropStatus };
      }
      return insideControl ? {} : null;
    },
  } as unknown as Element;
}

describe('dropping a card on a status column', () => {
  const apps = [app({ reportNumber: '001' }), app({ reportNumber: '002', status: 'Applied', normStatus: 'applied' })];

  it('resolves to the card and the canonical label of the target column', () => {
    expect(resolveDrop(apps, '001', 'applied')).toEqual({ app: apps[0], next: 'Applied' });
  });

  it('is a no-op when dropped back on its own column, on an unknown card, or on a virtual column', () => {
    expect(resolveDrop(apps, '002', 'applied')).toBeNull();
    expect(resolveDrop(apps, '999', 'applied')).toBeNull();
    expect(resolveDrop(apps, '001', 'top')).toBeNull();
  });
});

describe('pointer drag session', () => {
  it('starts inactive with no target, so a plain click never counts as a drag', () => {
    expect(beginDrag('001', 10, 20)).toEqual({
      reportNumber: '001', startX: 10, startY: 20, x: 10, y: 20, active: false, target: null,
    });
  });

  it('stays inactive and ignores the hovered column until the pointer travels past the threshold', () => {
    const s = moveDrag(beginDrag('001', 10, 20), 10 + DRAG_THRESHOLD_PX - 1, 20, 'applied');
    expect(s.active).toBe(false);
    expect(s.target).toBeNull();
    expect(s).toMatchObject({ x: 10 + DRAG_THRESHOLD_PX - 1, y: 20 });
  });

  it('activates at the threshold and then tracks the column under the pointer', () => {
    const active = moveDrag(beginDrag('001', 10, 20), 10, 20 + DRAG_THRESHOLD_PX, 'applied');
    expect(active.active).toBe(true);
    expect(active.target).toBe('applied');

    const outside = moveDrag(active, 300, 300, null);
    expect(outside.active).toBe(true);
    expect(outside.target).toBeNull();
  });

  it('stays active once activated even if the pointer returns near the start point', () => {
    const active = moveDrag(beginDrag('001', 10, 20), 100, 20, 'applied');
    const back = moveDrag(active, 11, 20, 'evaluated');
    expect(back.active).toBe(true);
    expect(back.target).toBe('evaluated');
  });
});

describe('finding the drop status under the pointer', () => {
  it('reads data-drop-status from the nearest column or collapsed chip', () => {
    expect(dropStatusAt(fakeElement({ dropStatus: 'interview' }))).toBe('interview');
  });

  it('is null over anything that is not a drop target', () => {
    expect(dropStatusAt(fakeElement({}))).toBeNull();
    expect(dropStatusAt(null)).toBeNull();
  });
});

describe('deciding whether a pointerdown may start a drag', () => {
  it('starts from the card body', () => {
    expect(startsDragFrom(fakeElement({}))).toBe(true);
  });

  it('never starts from the status select or another control inside the card', () => {
    expect(startsDragFrom(fakeElement({ insideControl: true }))).toBe(false);
  });

  it('never starts from a non-element target', () => {
    expect(startsDragFrom(null)).toBe(false);
    expect(startsDragFrom({} as EventTarget)).toBe(false);
  });
});
