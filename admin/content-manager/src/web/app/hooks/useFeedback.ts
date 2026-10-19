import { useCallback, useState } from 'react';
import type { FeedbackKind } from '../components/Feedback.tsx';

export interface FeedbackMessage {
  kind: FeedbackKind;
  message: string;
}

export interface FeedbackController {
  feedback: FeedbackMessage | null;
  notify: (kind: FeedbackKind, message: string) => void;
  clear: () => void;
}

// Plan 242: transient notice state, extracted from the pages' repeated
// `setError(null); setFeedback(null)` + `setFeedback('…')` pairs — the last
// notice wins. No timer lives here: pages that auto-dismiss render through
// the <Feedback> component (which owns its own 5 s dismissal for successes);
// pages with persistent banners keep them persistent. `notify` always takes
// the final, already-formatted string.
export function useFeedback(initial: FeedbackMessage | null = null): FeedbackController {
  const [feedback, setFeedback] = useState<FeedbackMessage | null>(initial);

  const notify = useCallback((kind: FeedbackKind, message: string): void => {
    setFeedback({ kind, message });
  }, []);

  const clear = useCallback((): void => setFeedback(null), []);

  return { feedback, notify, clear };
}
