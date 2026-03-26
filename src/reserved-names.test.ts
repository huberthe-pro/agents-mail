import { describe, it, expect } from 'vitest';
import { checkReservedName } from './reserved-names';

describe('checkReservedName', () => {
  // ── Wordlist: system words ──
  it('blocks system words', () => {
    expect(checkReservedName('admin')).toEqual({ reserved: true, reason: 'This name is reserved for system use' });
    expect(checkReservedName('noreply')).toEqual({ reserved: true, reason: 'This name is reserved for system use' });
    expect(checkReservedName('postmaster')).toEqual({ reserved: true, reason: 'This name is reserved for system use' });
  });

  // ── Wordlist: countries ──
  it('blocks country names', () => {
    expect(checkReservedName('china')).toEqual({ reserved: true, reason: 'This name is reserved for system use' });
    expect(checkReservedName('Japan')).toEqual({ reserved: true, reason: 'This name is reserved for system use' });
  });

  // ── Wordlist: brands ──
  it('blocks brand names', () => {
    expect(checkReservedName('google')).toEqual({ reserved: true, reason: 'This name is reserved for system use' });
    expect(checkReservedName('OpenAI')).toEqual({ reserved: true, reason: 'This name is reserved for system use' });
  });

  // ── Wordlist: trademarks ──
  it('blocks trademarks', () => {
    expect(checkReservedName('chatgpt')).toEqual({ reserved: true, reason: 'This name is reserved for system use' });
    expect(checkReservedName('Claude')).toEqual({ reserved: true, reason: 'This name is reserved for system use' });
  });

  // ── Wordlist: sensitive ──
  it('blocks sensitive words', () => {
    expect(checkReservedName('virus')).toEqual({ reserved: true, reason: 'This name is reserved for system use' });
    expect(checkReservedName('phishing')).toEqual({ reserved: true, reason: 'This name is reserved for system use' });
  });

  // ── Rule a: short names ──
  it('blocks names shorter than 5 characters', () => {
    expect(checkReservedName('abcd')).toEqual({ reserved: true, reason: 'Names shorter than 5 characters are reserved' });
    expect(checkReservedName('bot')).toEqual({ reserved: true, reason: 'Names shorter than 5 characters are reserved' });
    expect(checkReservedName('ai')).toEqual({ reserved: true, reason: 'Names shorter than 5 characters are reserved' });
  });

  // ── Rule b: repeated digits ──
  it('blocks 6+ consecutive identical digits', () => {
    expect(checkReservedName('111111')).toEqual({ reserved: true, reason: 'Repeated digit sequences are reserved' });
    expect(checkReservedName('999999999')).toEqual({ reserved: true, reason: 'Repeated digit sequences are reserved' });
    expect(checkReservedName('000000')).toEqual({ reserved: true, reason: 'Repeated digit sequences are reserved' });
  });

  it('blocks repeated digits with hyphens stripped', () => {
    expect(checkReservedName('111-111')).toEqual({ reserved: true, reason: 'Repeated digit sequences are reserved' });
  });

  // ── Allowed names ──
  it('allows normal agent names', () => {
    expect(checkReservedName('my-cool-agent')).toEqual({ reserved: false });
    expect(checkReservedName('research-bot-42')).toEqual({ reserved: false });
    expect(checkReservedName('hello-world')).toEqual({ reserved: false });
    expect(checkReservedName('agent-alpha')).toEqual({ reserved: false });
  });

  it('allows 5-char names not in wordlist', () => {
    expect(checkReservedName('abcde')).toEqual({ reserved: false });
    expect(checkReservedName('agent')).toEqual({ reserved: false });
  });

  it('allows non-repeating digit sequences', () => {
    expect(checkReservedName('123456')).toEqual({ reserved: false });
    expect(checkReservedName('112233')).toEqual({ reserved: false });
  });

  // ── Case insensitive ──
  it('is case insensitive', () => {
    expect(checkReservedName('ADMIN')).toEqual({ reserved: true, reason: 'This name is reserved for system use' });
    expect(checkReservedName('Google')).toEqual({ reserved: true, reason: 'This name is reserved for system use' });
  });
});
