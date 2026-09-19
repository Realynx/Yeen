import type { NextFunction, Request, Response } from 'express';
import { playbackReceiverCorsMiddleware } from './playback-receiver-cors.middleware';

describe('playbackReceiverCorsMiddleware', () => {
  it('allows a receiver origin to read authenticated range responses', () => {
    const next = jest.fn() as NextFunction;
    const request = {
      method: 'GET',
      headers: { origin: 'https://receiver.example' },
    } as unknown as Request;
    const setHeader = jest.fn();
    const response = {
      setHeader,
    } as unknown as Response;

    playbackReceiverCorsMiddleware(request, response, next);

    expect(setHeader).toHaveBeenCalledWith(
      'Access-Control-Allow-Origin',
      'https://receiver.example',
    );
    expect(setHeader).toHaveBeenCalledWith(
      'Access-Control-Expose-Headers',
      'Accept-Ranges, Content-Length, Content-Range',
    );
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('answers receiver range preflight before strict application CORS', () => {
    const next = jest.fn() as NextFunction;
    const end = jest.fn();
    const status = jest.fn(() => ({ end }));
    const setHeader = jest.fn();
    const request = {
      method: 'OPTIONS',
      headers: {
        origin: 'https://receiver.example',
        'access-control-request-headers': 'range',
      },
    } as unknown as Request;
    const response = {
      setHeader,
      status,
    } as unknown as Response;

    playbackReceiverCorsMiddleware(request, response, next);

    expect(setHeader).toHaveBeenCalledWith(
      'Access-Control-Allow-Headers',
      'range',
    );
    expect(status).toHaveBeenCalledWith(204);
    expect(end).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
  });
});
