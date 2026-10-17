import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { SendOtpDto } from './send-otp.dto';
import { SEND_OTP_LIMIT } from '../common/throttle-policies';
import { normalizePhone, trackByPhone } from '../common/trackers';

@Controller('auth')
export class AuthController {
  // Da bo @SkipThrottle(): day chinh la endpoint ton tien nhat, phai duoc gioi han.
  @Throttle({ default: { ...SEND_OTP_LIMIT, getTracker: trackByPhone } })
  @Post('send-otp')
  sendOtp(@Body() dto: SendOtpDto) {
    const phone = normalizePhone(dto?.phone);
    if (!phone) throw new BadRequestException('phone is required');
    return { status: 'sent', phone };
  }
}
