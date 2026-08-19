/**
 * imageUrl.test.js
 *
 * Tests for the resolveImageUrl helper used by dashboard photo cards.
 */

import { resolveImageUrl } from '../imageUrl';
import { BASE_URL } from '../../api/config';

describe('resolveImageUrl', () => {
  it('returns null for empty input', () => {
    expect(resolveImageUrl(null)).toBeNull();
    expect(resolveImageUrl(undefined)).toBeNull();
    expect(resolveImageUrl('')).toBeNull();
  });

  it('leaves absolute http(s) URLs untouched', () => {
    expect(resolveImageUrl('https://example.com/photo.png')).toBe('https://example.com/photo.png');
    expect(resolveImageUrl('http://localhost:8080/uploads/a.jpg')).toBe('http://localhost:8080/uploads/a.jpg');
  });

  it('prefixes relative /uploads paths with the backend base URL', () => {
    expect(resolveImageUrl('/uploads/abc.jpg')).toBe(`${BASE_URL}/uploads/abc.jpg`);
  });

  it('normalizes paths missing the leading slash', () => {
    expect(resolveImageUrl('uploads/abc.jpg')).toBe(`${BASE_URL}/uploads/abc.jpg`);
  });
});
