import React, { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { MOBILE_BASE } from '../api.js';
import 'altcha';
import 'altcha/altcha.css';

export default function AltchaWidget({ onVerified }) {
  const ref = useRef(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const handleVerified = (event) => {
      const detail = event.detail || {};
      onVerified({ captchaToken: detail.payload || '' });
    };
    element.addEventListener('verified', handleVerified);
    return () => element.removeEventListener('verified', handleVerified);
  }, [onVerified]);

  const challengeUrl = `${Capacitor.isNativePlatform() ? MOBILE_BASE : ''}/api/auth/captcha/challenge`;

  return <altcha-widget ref={ref} challenge={challengeUrl} verifyurl="" name="altcha" />;
}
