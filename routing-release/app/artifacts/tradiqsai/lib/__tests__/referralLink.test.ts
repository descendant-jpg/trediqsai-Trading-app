import { describe, expect, it } from 'vitest';
import { extractReferralCode } from '../referralLink';

describe('extractReferralCode', () => {
  it('parses universal links', () => {
    expect(extractReferralCode('https://tradiqsai.com/r/AB12CD')).toBe('AB12CD');
  });

  it('parses custom scheme deep links (r as host)', () => {
    expect(extractReferralCode('tradiqsai://r/ab12cd')).toBe('AB12CD');
  });

  it('parses web query params', () => {
    expect(extractReferralCode('http://localhost:8081/?ref=xy99')).toBe('XY99');
    expect(extractReferralCode('http://localhost:8081/?code=xy99')).toBe('XY99');
  });

  it('parses /r/<code> nested under a base path', () => {
    expect(extractReferralCode('https://example.com/app/r/ZZ11')).toBe('ZZ11');
  });

  it('returns null for unrelated or invalid URLs', () => {
    expect(extractReferralCode(null)).toBeNull();
    expect(extractReferralCode('')).toBeNull();
    expect(extractReferralCode('https://tradiqsai.com/')).toBeNull();
    expect(extractReferralCode('https://tradiqsai.com/r/')).toBeNull();
    expect(extractReferralCode('not a url')).toBeNull();
    expect(extractReferralCode('https://tradiqsai.com/rank/foo')).toBeNull();
  });
});
