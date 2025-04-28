// user-status.controller.ts
import { Controller, Get, Query } from '@nestjs/common';
import { UserStatusService } from './services/user-status.service';
import { UserStatusData, UserStatusFilters } from '../progress-users/interfaces/user-status.interface';

@Controller('api/user-status')
export class UserStatusController {
    constructor(private readonly userStatusService: UserStatusService) {}


    @Get('export2-data')
    async getExportData(
      @Query('start_date') startDate: string,
      @Query('end_date') endDate: string,
      @Query('club_id') clubId?: string,
      @Query('client_id') clientid?: string,
      @Query('search_course') searchCourse?: string,
      @Query('search_user') searchUser?: string,
      @Query('search_email') searchEmail?: string,
      @Query('search_identification') searchIdentification?: string,
      @Query('page') page?: string,
      @Query('page_size') pageSize?: string,
    ): Promise<UserStatusData> {
      const filters: UserStatusFilters = {
        startDate,
        endDate,
        clubId: clubId ? parseInt(clubId, 10) : undefined,
        clientid: clientid ? parseInt(clientid, 10) : undefined,
        searchCourse,
        searchUser,
        searchEmail,
        searchIdentification,
        page: page ? parseInt(page, 10) : 1,
        pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      };
  
      console.log('Filters received:', filters);
  
      return this.userStatusService.getUserStatusData(filters);
    }
  
    @Get('clubs2')
    async getClubs(
      @Query('client_id') clientid?: string,
      @Query('club_id') clubId?: string,
      @Query('search_course') searchCourse?: string,
    ) {
      const parsedClientId = clientid ? parseInt(clientid, 10) : undefined;
      const parsedClubId = clubId ? parseInt(clubId, 10) : undefined;
  
      const clubs = await this.userStatusService.getClubsOnly(
        parsedClubId,
        searchCourse,
        parsedClientId
      );
  
      return { clubs };
    }
  
    // @Get('export-data')
    // async getExportData(
    //   @Query('start_date') startDate: string,
    //   @Query('end_date') endDate: string,
    //   @Query('club_id') clubId?: string,
    //   @Query('client_id') clientid?: string,
    //   @Query('search_course') searchCourse?: string,
    //   @Query('search_user') searchUser?: string,
    //   @Query('search_email') searchEmail?: string,
    //   @Query('search_identification') searchIdentification?: string,
    //   @Query('page') page?: string,
    //   @Query('page_size') pageSize?: string,
    // ): Promise<UserStatusData> {
    //   const filters: UserStatusFilters = {
    //     startDate,
    //     endDate,
    //     clubId: clubId ? parseInt(clubId, 10) : undefined,
    //     clientid: clientid ? parseInt(clientid, 10) : undefined,
    //     searchCourse,
    //     searchUser,
    //     searchEmail,
    //     searchIdentification,
    //     page: page ? parseInt(page, 10) : 1,
    //     pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    //   };
  
    //   console.log('Filters received:', filters);
  
    //   return this.userStatusService.getUserStatusData(filters);
    // }
  
    // @Get('clubs')
    // async getClubs(
    //   @Query('client_id') clientid?: string,
    //   @Query('club_id') clubId?: string,
    //   @Query('search_course') searchCourse?: string,
    // ) {
    //   const parsedClientId = clientid ? parseInt(clientid, 10) : undefined;
    //   const parsedClubId = clubId ? parseInt(clubId, 10) : undefined;
  
    //   const clubs = await this.userStatusService.getClubsOnly(
    //     parsedClubId,
    //     searchCourse,
    //     parsedClientId
    //   );
  
    //   return { clubs };
    // }
}