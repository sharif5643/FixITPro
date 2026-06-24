import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ChatService } from './chat.service';

interface AuthSocket extends Socket {
  userId?: string;
  userName?: string;
}

@WebSocketGateway({
  cors: {
    origin: (origin: string, cb: (err: Error | null, allow?: boolean) => void) => {
      // Allow the configured CORS origin(s) + local dev
      cb(null, true);
    },
    credentials: true,
  },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private logger = new Logger(ChatGateway.name);

  constructor(
    private chatService: ChatService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async handleConnection(client: AuthSocket) {
    try {
      const token = this.extractToken(client);
      if (!token) { client.disconnect(); return; }

      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });
      client.userId = payload.sub;
      client.userName = payload.name ?? payload.email;
      this.logger.debug(`Connected: ${client.userId}`);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthSocket) {
    this.logger.debug(`Disconnected: ${client.userId}`);
  }

  @SubscribeMessage('join_room')
  handleJoinRoom(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() data: { repairId: string },
  ) {
    client.join(`repair:${data.repairId}`);
    return { event: 'joined', data: { repairId: data.repairId } };
  }

  @SubscribeMessage('leave_room')
  handleLeaveRoom(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() data: { repairId: string },
  ) {
    client.leave(`repair:${data.repairId}`);
  }

  @SubscribeMessage('send_message')
  async handleMessage(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() data: { repairId: string; content: string },
  ) {
    if (!client.userId || !data.content?.trim()) return;

    const message = await this.chatService.saveMessage(
      data.repairId,
      client.userId,
      data.content.trim(),
    );

    // Broadcast to everyone in the repair room (including sender)
    this.server.to(`repair:${data.repairId}`).emit('new_message', {
      id:          message.id,
      repairId:    message.repairId,
      content:     message.content,
      senderId:    message.senderId,
      senderName:  message.sender.name,
      createdAt:   message.createdAt,
    });
  }

  private extractToken(client: Socket): string | null {
    // Try cookie first
    const cookieHeader = client.handshake.headers.cookie ?? '';
    const match = cookieHeader.match(/access_token=([^;]+)/);
    if (match) return match[1];

    // Fallback: auth header
    const auth = client.handshake.auth?.token ?? client.handshake.headers.authorization ?? '';
    if (auth.startsWith('Bearer ')) return auth.slice(7);

    return null;
  }
}
