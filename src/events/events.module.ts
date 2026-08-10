import { Global, Module } from '@nestjs/common'
import { EventsService } from './events.service'
import { EventsGateway } from './events.gateway'
import { JwtModule } from '@nestjs/jwt'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { jwtConfig } from 'src/config/jwt.config'

@Global()
@Module({
	providers: [EventsGateway, EventsService],
	imports: [
		JwtModule.registerAsync({
			imports: [ConfigModule],
			inject: [ConfigService],
			useFactory: jwtConfig
		})
	],
	exports: [EventsGateway]
})
export class EventsModule {}
