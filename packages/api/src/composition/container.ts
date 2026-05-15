/**
 * Composition root — wires domain use-case factories with their infrastructure
 * adapters.
 *
 * All adapter singletons are constructed at MODULE scope (i.e., once per Lambda
 * container / cold start) so that DynamoDB connections and credentials are
 * reused across warm invocations.
 *
 * The exported `container` object holds one READY-TO-CALL use-case function per
 * operation (result of `makeX(deps)`). Handlers import from here and call the
 * function directly, passing the request input.
 */

import {
  DynamoDBWalletRepository,
  DynamoDBTransactionRepository,
  DynamoDBCategoryRepository,
} from '../adapters/dynamodb/index.js';
import { SystemClock } from '../adapters/system/SystemClock.js';
import { UuidIdGenerator } from '../adapters/system/UuidIdGenerator.js';
import {
  makeCreateWallet,
  makeListWallets,
  makeGetWallet,
  makeUpdateWallet,
  makeDeleteWallet,
  makeAddTransaction,
  makeGetTransaction,
  makeUpdateTransaction,
  makeDeleteTransaction,
  makeListTransactionsByWallet,
  makeListTransactionsByCategory,
  makeListCategories,
  makeCreateCustomCategory,
  makeDeleteCustomCategory,
} from '@smart-wallet/domain';

// ── Infrastructure singletons (module scope = cold-start only) ────────────

const walletRepo = new DynamoDBWalletRepository();
const transactionRepo = new DynamoDBTransactionRepository();
const categoryRepo = new DynamoDBCategoryRepository();
const clock = new SystemClock();
const idGen = new UuidIdGenerator();

// ── Use case factories (one per operation) ────────────────────────────────

export const container = {
  // Wallet operations
  createWallet: makeCreateWallet({ walletRepo, idGen, clock }),
  listWallets: makeListWallets({ walletRepo }),
  getWallet: makeGetWallet({ walletRepo }),
  updateWallet: makeUpdateWallet({ walletRepo, transactionRepo, clock }),
  deleteWallet: makeDeleteWallet({ walletRepo, clock }),

  // Transaction operations
  addTransaction: makeAddTransaction({
    walletRepo,
    transactionRepo,
    categoryRepo,
    idGen,
    clock,
  }),
  getTransaction: makeGetTransaction({ transactionRepo }),
  updateTransaction: makeUpdateTransaction({
    walletRepo,
    transactionRepo,
    categoryRepo,
    clock,
  }),
  deleteTransaction: makeDeleteTransaction({
    walletRepo,
    transactionRepo,
    clock,
  }),
  listTransactionsByWallet: makeListTransactionsByWallet({ walletRepo, transactionRepo }),
  listTransactionsByCategory: makeListTransactionsByCategory({ transactionRepo }),

  // Category operations
  listCategories: makeListCategories({ categoryRepo }),
  createCustomCategory: makeCreateCustomCategory({ categoryRepo, idGen, clock }),
  deleteCustomCategory: makeDeleteCustomCategory({
    categoryRepo,
    transactionRepo,
    clock,
  }),
} as const;

export type Container = typeof container;
