import { Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ADMIN_ONLY_ROLES } from '../common/utils/permissions';
import { smtpTestMail } from './mail-templates';
import { MailService } from './mail.service';

@Controller('mail')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ADMIN_ONLY_ROLES)
export class MailController {
  constructor(private readonly mailService: MailService) {}

  @Post('test')
  @HttpCode(HttpStatus.OK)
  async sendTest(@CurrentUser('email') email: string) {
    const template = smtpTestMail();
    const result = await this.mailService.sendMail({
      to: email,
      subject: template.subject,
      text: template.text,
      html: template.html,
    });

    return {
      sent: result.sent,
      mode: result.mode,
      to: email,
      smtp_enabled: this.mailService.isEnabled(),
    };
  }
}
