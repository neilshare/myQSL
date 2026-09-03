import { nanoid } from "nanoid";

export const Ids = {
  publicId: (size = 22) => nanoid(size),
  internalId: () => nanoid(16)
};
