'use client';

import { createContext, useContext } from 'react';

/** The signed-in account, for things that must differ per person (like the order of their questions). */
export const AccountContext = createContext<{ email: string }>({ email: '' });
export const useAccount = () => useContext(AccountContext);
