"use client";

/**
 * Photographs that have been chosen for a product that has not been saved
 * yet.
 *
 * A photograph belongs to a product, and a product that does not exist
 * yet has nowhere to keep one. Rather than make the administrator save
 * an empty product and then come back for the photographs, the files are
 * held here until the product exists, and are uploaded the moment it
 * does.
 *
 * The queue is held in the page rather than in a component, so that it
 * survives the move from the "add" screen to the "edit" screen — which is
 * a navigation, not a reload.
 */

type Queued = {
  /** The product the photographs were chosen for. */
  slug: string;
  file: File;
};

/**
 * How many photographs may be waiting.
 *
 * The queue holds files, and a file is a handle on something on the disk.
 * A queue that grew without end would keep those handles for as long as
 * the tab was open, so it is capped and the oldest are let go.
 */
const MAX_WAITING = 40;

let queue: Queued[] = [];

/** Holds some photographs until their product has been saved. */
export function queueUploads(slug: string, files: File[]): void {
  queue = [...queue, ...files.map((file) => ({ slug, file }))].slice(
    -MAX_WAITING
  );
}

/**
 * The photographs held for a product, and takes them away.
 *
 * They are taken rather than copied, so that a second look does not
 * upload the same photograph twice.
 */
export function takeUploads(slug: string): File[] {
  const mine: File[] = [];
  const rest: Queued[] = [];
  for (const held of queue) {
    if (held.slug === slug) mine.push(held.file);
    else rest.push(held);
  }
  queue = rest;
  return mine;
}

/** How many photographs are waiting for a product to be saved. */
export function queuedFor(slug: string): number {
  let count = 0;
  for (const held of queue) {
    if (held.slug === slug) count++;
  }
  return count;
}
