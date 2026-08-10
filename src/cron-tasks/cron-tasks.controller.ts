import { Controller } from '@nestjs/common';
import { CronTasksService } from './cron-tasks.service';

@Controller('cron-tasks')
export class CronTasksController {
  constructor(private readonly cronTasksService: CronTasksService) {}
}
