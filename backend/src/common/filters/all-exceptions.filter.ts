import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';
import { safeErrorMessage } from '../utils/redact';

/** Consistent error envelope: { success: false, error: { code, message } }. Internals never leak. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpError');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    if (res.headersSent) return;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      message = typeof body === 'string' ? body : ((body as { message?: string | string[] }).message ?? exception.message);
    } else {
      this.logger.error({ msg: 'Unhandled exception', err: safeErrorMessage(exception) });
    }

    res.status(status).json({
      success: false,
      error: { code: HttpStatus[status] ?? 'ERROR', message },
    });
  }
}
