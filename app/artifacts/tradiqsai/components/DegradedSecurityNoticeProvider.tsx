import React, { useCallback, useEffect, useRef, useState } from 'react';
import { setDegradedSecurityHandler } from '@workspace/api-client-react';
import { DegradedSecurityNotice } from './DegradedSecurityNotice';

const WRITE_METHODS = new Set(['PUT', 'POST', 'DELETE', 'PATCH']);
const AUTO_DISMISS_MS = 8000;

/**
 * Registers the app-wide degraded-security callback once. Any successful
 * settings write marked `X-Security-Check: degraded` shows the shared notice,
 * regardless of which screen initiated the change.
 */
export function DegradedSecurityNoticeProvider() {
  const [visible, setVisible] = useState(false);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    setVisible(false);
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
  }, []);

  useEffect(() => {
    setDegradedSecurityHandler(({ method }) => {
      if (!WRITE_METHODS.has(method.toUpperCase())) return;
      setVisible(true);
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
      dismissTimer.current = setTimeout(dismiss, AUTO_DISMISS_MS);
    });

    return () => {
      setDegradedSecurityHandler(null);
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, [dismiss]);

  return <DegradedSecurityNotice visible={visible} onDismiss={dismiss} />;
}