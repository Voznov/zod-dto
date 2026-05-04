import { type ZodDtoClass } from './base';

type OnCreateHook = (dtoClass: ZodDtoClass) => void;

const onCreateHooks: OnCreateHook[] = [];
const createdDtos: ZodDtoClass[] = [];

export const registerOnCreate = (hook: OnCreateHook): (() => void) => {
  onCreateHooks.push(hook);
  for (const dto of createdDtos) hook(dto);

  return () => {
    const index = onCreateHooks.indexOf(hook);
    if (index !== -1) onCreateHooks.splice(index, 1);
  };
};

export const notifyDtoCreated = (dto: ZodDtoClass): void => {
  createdDtos.push(dto);
  for (const hook of onCreateHooks) hook(dto);
};
