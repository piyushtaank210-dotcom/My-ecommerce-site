/**
 * Sending a file to the shop.
 *
 * The shop may keep its files in two places, and the browser has to
 * know which before it sends anything:
 *
 *   - On a machine the shop keeps the file itself, so the browser
 *     sends it straight to the route that writes the row down.
 *   - On a serverless deployment the shop cannot hold the file — its
 *     disk is read-only, and a request that carries a video is too
 *     large to be accepted — so the browser sends it straight to the
 *     shop's store, and the shop signs the upload and says where to
 *     put it.
 *
 * This module asks the shop which it is, and then does the right
 * thing. The pages that use it do not have to know the difference.
 */

/**
 * How big a file has to be before it is sent in pieces.
 *
 * Below this it goes in one request, which is quicker. Above it, the
 * pieces go up in parallel and a piece that fails is tried again.
 */
const MULTIPART_ABOVE_BYTES = 8 * 1024 * 1024;

/** What the shop says about a file that is on its way. */
export type UploadTicket = {
  mode: "app" | "direct";
  /** Where to send the file when the shop keeps it itself. */
  endpoint?: string;
  /** Where to sign the upload when the store keeps it. */
  tokenUrl?: string;
  /** Whether the store may show the file to everybody. */
  access?: "public" | "private";
  /** Where each file is to be put. */
  uploads?: {
    index: number;
    pathname: string;
    uploadId?: string;
    name: string;
    type: string;
    size: number;
    evidenceKind?: string;
  }[];
};

/** How an upload went. */
export type UploadOutcome = {
  ok: boolean;
  /** What went wrong, when something did. */
  error?: string;
  /** The ids of the files that were staged, for the evidence flow. */
  uploadIds: string[];
  /** The last thing the shop said. */
  data: unknown;
};

/**
 * Asks the shop where a file should go.
 */
async function askForTicket(
  ticketUrl: string,
  files: File[],
  payload: Record<string, unknown>
): Promise<UploadTicket | null> {
  try {
    const res = await fetch(ticketUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        phase: "ticket",
        files: files.map((f) => ({
          name: f.name,
          type: f.type,
          size: f.size,
        })),
        ...payload,
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        mode: "app",
        endpoint: "",
        uploads: [],
        ...(typeof data?.error === "string" ? { error: data.error } : {}),
      } as UploadTicket;
    }
    return data as UploadTicket;
  } catch {
    return null;
  }
}

/**
 * Sends one file to the shop, the way a form would.
 *
 * It is sent on its own so that the page can show how each file is
 * getting on, rather than sitting still until the whole lot has
 * finished.
 */
function sendToApp(options: {
  endpoint: string;
  file: File;
  fields: Record<string, string>;
  onProgress?: (index: number, percent: number) => void;
  index: number;
}): Promise<{ ok: boolean; data: unknown; error?: string }> {
  return new Promise((resolve) => {
    const form = new FormData();
    form.append("files", options.file);
    for (const [name, value] of Object.entries(options.fields)) {
      form.append(name, value);
    }

    const xhr = new XMLHttpRequest();
    xhr.open("POST", options.endpoint);

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      options.onProgress?.(
        options.index,
        Math.round((event.loaded / event.total) * 100)
      );
    };

    xhr.onload = () => {
      let data: unknown = null;
      let message = "The file could not be sent.";
      try {
        data = JSON.parse(xhr.responseText);
        const given = (data as { error?: unknown })?.error;
        if (typeof given === "string" && given) message = given;
      } catch {
        // The answer was not the one we expected.
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        options.onProgress?.(options.index, 100);
        resolve({ ok: true, data });
      } else {
        resolve({ ok: false, data, error: message });
      }
    };

    xhr.onerror = () => {
      resolve({ ok: false, data: null, error: "The file could not be sent." });
    };

    xhr.ontimeout = () => {
      resolve({
        ok: false,
        data: null,
        error: "The upload took too long. Please try again.",
      });
    };

    xhr.send(form);
  });
}

/**
 * Sends files to the shop's store.
 *
 * The shop has said where each file goes and has signed the upload,
 * so the file never passes through the shop. That is what lets a
 * customer send a video of a damaged console from a phone.
 */
async function sendDirect(options: {
  ticket: UploadTicket;
  files: File[];
  tokenUrl: string;
  payload: Record<string, unknown>;
  onProgress?: (index: number, percent: number) => void;
}): Promise<{ ok: boolean; uploads: Record<string, unknown>[]; error?: string }> {
  const { upload } = await import("@vercel/blob/client");
  const uploads: Record<string, unknown>[] = [];

  for (let index = 0; index < options.files.length; index++) {
    const file = options.files[index];
    const slot = options.ticket.uploads?.find((u) => u.index === index);
    if (!slot) {
      return { ok: false, uploads, error: "The upload was not set up properly." };
    }

    try {
      const result = await upload(slot.pathname, file, {
        access: options.ticket.access ?? "public",
        handleUploadUrl: options.tokenUrl,
        clientPayload: JSON.stringify({
          ...options.payload,
          uploadId: slot.uploadId,
          evidenceKind: slot.evidenceKind,
        }),
        // A large file is sent in pieces, in parallel, and a piece that
        // fails is tried again — so a video sent from a phone on a poor
        // connection still arrives.
        multipart: file.size > MULTIPART_ABOVE_BYTES,
        onUploadProgress: (event) => {
          options.onProgress?.(index, event.percentage);
        },
      });

      uploads.push({
        pathname: result.pathname,
        url: result.url,
        name: slot.name,
        type: slot.type,
        size: file.size,
        uploadId: slot.uploadId,
        evidenceKind: slot.evidenceKind,
      });
    } catch (err) {
      return {
        ok: false,
        uploads,
        error:
          err instanceof Error && err.message
            ? err.message
            : "The file could not be sent.",
      };
    }
  }

  return { ok: true, uploads };
}

/**
 * Sends files to the shop and waits for the shop to write them down.
 */
export async function uploadFiles(options: {
  /** Where the shop is asked where the files should go. */
  ticketUrl: string;
  /** Where the shop is told the files have arrived. */
  commitUrl?: string;
  files: File[];
  /** Anything else the shop needs to know. */
  payload?: Record<string, unknown>;
  /** The fields the shop's own form expects, when it keeps the file. */
  appFields?: Record<string, string>;
  /** How each file is getting on. */
  onProgress?: (index: number, percent: number) => void;
}): Promise<UploadOutcome> {
  const payload = options.payload ?? {};
  const files = options.files;

  if (!files.length) {
    return { ok: false, error: "Choose at least one file.", uploadIds: [], data: null };
  }

  const ticket = await askForTicket(options.ticketUrl, files, payload);
  if (!ticket) {
    return {
      ok: false,
      error: "The shop could not be reached. Please try again.",
      uploadIds: [],
      data: null,
    };
  }

  // The shop said no — it answered the ticket with an error.
  if (ticket.mode === "app" && ticket.endpoint === "") {
    const message = (ticket as unknown as { error?: string }).error;
    return {
      ok: false,
      error: message || "The file could not be sent.",
      uploadIds: [],
      data: null,
    };
  }

  if (ticket.mode === "app") {
    if (!ticket.endpoint) {
      return {
        ok: false,
        error: "The shop did not say where to send the file.",
        uploadIds: [],
        data: null,
      };
    }
    const uploadIds: string[] = [];
    let last: unknown = null;

    for (let index = 0; index < files.length; index++) {
      // A replacement is carried out once, by the first file; the rest
      // are added beside it.
      const fields: Record<string, string> = { ...(options.appFields ?? {}) };
      if (index > 0 && fields.replaceId) delete fields.replaceId;

      const result = await sendToApp({
        endpoint: ticket.endpoint,
        file: files[index],
        fields,
        onProgress: options.onProgress,
        index,
      });

      if (!result.ok) {
        return {
          ok: false,
          error: result.error ?? "The file could not be sent.",
          uploadIds,
          data: last,
        };
      }
      last = result.data;
      const staged = (result.data as { uploads?: { id?: string }[] })?.uploads;
      if (Array.isArray(staged)) {
        for (const one of staged) {
          if (one?.id) uploadIds.push(one.id);
        }
      }
    }

    return { ok: true, uploadIds, data: last };
  }

  // The store keeps the files.
  const sent = await sendDirect({
    ticket,
    files,
    tokenUrl: ticket.tokenUrl ?? options.ticketUrl,
    payload,
    onProgress: options.onProgress,
  });

  if (!sent.ok) {
    return {
      ok: false,
      error: sent.error ?? "The file could not be sent.",
      uploadIds: [],
      data: null,
    };
  }

  // The shop is told what has arrived, and writes it down.
  try {
    const res = await fetch(options.commitUrl ?? options.ticketUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        phase: "commit",
        uploads: sent.uploads,
        ...payload,
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        ok: false,
        error:
          (data as { error?: string })?.error ??
          "The shop could not record the file.",
        uploadIds: [],
        data: null,
      };
    }
    const staged = (data as { uploads?: { id?: string }[] })?.uploads;
    const uploadIds = Array.isArray(staged)
      ? staged.map((one) => one?.id).filter((id): id is string => Boolean(id))
      : [];
    return { ok: true, uploadIds, data };
  } catch {
    return {
      ok: false,
      error: "The shop could not record the file.",
      uploadIds: [],
      data: null,
    };
  }
}
