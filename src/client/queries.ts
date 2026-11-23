import 'client-only';
import { useEffect, useRef } from 'react';
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  fetchBalance,
  fetchCurve,
  fetchHoldings,
  fetchOrder,
  fetchOrders,
  fetchQuote,
  fetchSetupStatus,
  fetchTenors,
  fetchTimeline,
  fetchYieldHistory,
  postOrder,
  postSetup,
  postSetupReset,
} from './api';
import type { CreateOrderRequest, SetupStatus } from './types';

const REFETCH_MS = 60_000;
const PENDING_POLL_MS = 1_000;

export const queryKeys = {
  setup: ['setup'],
  balance: ['balance'],
  holdings: ['holdings'],
  orders: ['orders'],
  order: (id: string) => ['order', id],
  timelines: ['timeline'],
  timeline: (to: string | undefined) => ['timeline', to ?? 'last-maturity'],
  quote: (request: CreateOrderRequest) => ['quote', request.maturityDate, request.faceCents],
  tenors: ['tenors'],
  curve: (date: string) => ['curve', date],
  yieldHistory: (tenors: string[], from: string) => ['yield-history', tenors.join(','), from],
};

function isBackfilling(status: SetupStatus | undefined) {
  const backfill = status?.yields.backfill;
  return Boolean(status?.initialized) && (backfill === 'idle' || backfill === 'running');
}

export function useSetupStatus() {
  return useQuery({
    queryKey: queryKeys.setup,
    queryFn: fetchSetupStatus,
    refetchInterval: (query) => (isBackfilling(query.state.data) ? PENDING_POLL_MS : false),
  });
}

export function useInitializeDesk() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: postSetup,
    onSuccess: (status) => queryClient.setQueryData(queryKeys.setup, status),
    onError: () => queryClient.invalidateQueries({ queryKey: queryKeys.setup }),
  });
}

export function useResetPortfolio() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: postSetupReset,
    onSuccess: (status) => {
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== queryKeys.setup[0] });
      queryClient.setQueryData(queryKeys.setup, status);
    },
  });
}

export function useBalance() {
  return useQuery({
    queryKey: queryKeys.balance,
    queryFn: fetchBalance,
    refetchInterval: (query) =>
      query.state.data?.pendingOrders.count ? PENDING_POLL_MS : REFETCH_MS,
  });
}

export function useHoldings() {
  return useQuery({
    queryKey: queryKeys.holdings,
    queryFn: fetchHoldings,
    refetchInterval: REFETCH_MS,
  });
}

export function useTimeline(to: string | undefined) {
  return useQuery({
    queryKey: queryKeys.timeline(to),
    queryFn: () => fetchTimeline(to),
    placeholderData: keepPreviousData,
    refetchInterval: REFETCH_MS,
  });
}

export function useOrders() {
  return useInfiniteQuery({
    queryKey: queryKeys.orders,
    queryFn: ({ pageParam }) => fetchOrders(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    refetchInterval: REFETCH_MS,
  });
}

export function useOrder(id: string | null) {
  return useQuery({
    queryKey: queryKeys.order(id ?? ''),
    queryFn: () => fetchOrder(id!),
    enabled: id !== null,
    refetchInterval: (query) => (query.state.data?.status === 'pending' ? PENDING_POLL_MS : false),
  });
}

export function usePlaceOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ request, key }: { request: CreateOrderRequest; key: string }) =>
      postOrder(request, key),
    onSuccess: (order) => {
      queryClient.setQueryData(queryKeys.order(order.id), order);
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders });
      void queryClient.invalidateQueries({ queryKey: queryKeys.balance });
    },
  });
}

export function useQuote(request: CreateOrderRequest | null) {
  return useQuery({
    queryKey: request ? queryKeys.quote(request) : ['quote', 'none'],
    queryFn: async () => ({ request: request!, quote: await fetchQuote(request!) }),
    enabled: request !== null,
    placeholderData: keepPreviousData,
    retry: false,
  });
}

export function useTenors() {
  return useQuery({ queryKey: queryKeys.tenors, queryFn: fetchTenors, staleTime: Infinity });
}

export function useCurve(date: string | null) {
  return useQuery({
    queryKey: queryKeys.curve(date ?? 'none'),
    queryFn: () => fetchCurve(date!),
    enabled: date !== null,
    refetchInterval: date === 'latest' ? REFETCH_MS : false,
  });
}

export function useYieldHistory(tenors: string[], from: string) {
  return useQuery({
    queryKey: queryKeys.yieldHistory(tenors, from),
    queryFn: () => fetchYieldHistory(tenors, from),
    enabled: tenors.length > 0,
  });
}

export function useRefreshPortfolioOnBalanceChange() {
  const queryClient = useQueryClient();
  const balance = useBalance().data;
  const signature = balance ? `${balance.updatedAt}|${balance.pendingOrders.count}` : null;
  const previous = useRef(signature);

  useEffect(() => {
    const changed = previous.current !== null && signature !== previous.current;
    previous.current = signature;
    if (!changed) return;

    for (const queryKey of [queryKeys.holdings, queryKeys.orders, queryKeys.timelines]) {
      void queryClient.invalidateQueries({ queryKey });
    }
  }, [signature, queryClient]);
}
