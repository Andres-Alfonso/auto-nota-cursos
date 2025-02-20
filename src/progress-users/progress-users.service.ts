import { Injectable } from '@nestjs/common';
import { CreateProgressUserDto } from './dto/create-progress-user.dto';
import { UpdateProgressUserDto } from './dto/update-progress-user.dto';

@Injectable()
export class ProgressUsersService {
  create(createProgressUserDto: CreateProgressUserDto) {
    return 'This action adds a new progressUser';
  }

  findAll() {
    return `This action returns all progressUsers`;
  }

  findOne(id: number) {
    return `This action returns a #${id} progressUser`;
  }

  update(id: number, updateProgressUserDto: UpdateProgressUserDto) {
    return `This action updates a #${id} progressUser`;
  }

  remove(id: number) {
    return `This action removes a #${id} progressUser`;
  }
}
