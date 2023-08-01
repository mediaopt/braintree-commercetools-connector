import { NextFunction, Request, Response } from 'express';
import { apiSuccess } from '../api/success.api';
import CustomError from '../errors/custom.error';
import { paymentController } from './payment.controller';
import { customerController } from './customer.controller';
import { ExtensionInput } from '@commercetools/platform-sdk/dist/declarations/src/generated/models/extension';

/**
 * Exposed service endpoint.
 * - Receives a POST request, parses the action and the controller
 * and returns it to the correct controller. We should be use 3. `Cart`, `Order` and `Payments`
 *
 * @param {Request} request The express request
 * @param {Response} response The express response
 * @param {NextFunction} next
 * @returns
 */
export const post = async (
  request: Request,
  response: Response,
  next: NextFunction
) => {
  try {
    const { action, resource }: ExtensionInput = request.body;

    if (!action || !resource) {
      throw new CustomError(400, 'Bad request - Missing body parameters.');
    }

    let data;
    switch (resource.typeId) {
      case 'payment':
        data = await paymentController(action, resource);
        break;
      case 'customer':
        data = await customerController(action, resource);
        break;
      default:
        throw new CustomError(
          500,
          `Internal Server Error - Resource not recognized. Allowed values are 'payment', 'customer'.`
        );
    }
    if (data?.statusCode === 200) {
      apiSuccess(200, data.actions, response);
      return;
    }
    throw new CustomError(data?.statusCode ?? 400, JSON.stringify(data));
  } catch (error) {
    if (error instanceof Error) {
      next(new CustomError(500, error.message));
    } else {
      next(error);
    }
  }
};
