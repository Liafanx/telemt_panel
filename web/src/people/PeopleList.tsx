import { useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AsyncState } from "../components/AsyncState";
import { Button } from "../ui/Button";
import { IconArrowDown, IconArrowUp, IconClose, IconPlus, IconSearch, IconSort } from "../ui/icons";
import { PageHeader } from "../ui/PageHeader";
import { CardList, CardRow } from "../ui/Card";
import { Sheet } from "../ui/Sheet";
import { pluralTemplate, useStrings, type Dict } from "../i18n";
import { useConnectionState } from "../realtime";
import { useUsersTopic, findQuotaEntry } from "./useUsersTopic";
import { useDebouncedValue } from "./useDebouncedValue";
import { useNow } from "./useNow";
import { UserCard } from "./UserCard";
import { UserActionSheet, type ActionSheetIntent } from "./UserActionSheet";
import { PeopleContext } from "./PeopleContext";
import { useBulkQuota } from "./bulkQuotaContext";
import { IconMore } from "../ui/icons";
import type { SwipeSide } from "./useUserRowGestures";
import {
  computeUserStatus,
  countUserFilters,
  filterUsersByQuery,
  getStoredUserSort,
  getUserQuota,
  matchesUserFilter,
  setStoredUserSort,
  nextSortState,
  sortPresetOf,
  sortUsers,
  SORT_PRESET_ORDER,
  type UserFilter,
  type UserFilterInput,
  type UserSortPreset,
} from "./users.helpers";
import type { UsersTopicUser } from "../realtime/topics";

const FILTER_ORDER: readonly UserFilter[] = ["all", "online", "issues"];
const PHONE_LIST_QUERY = "(max-width: 650px)";

export function PeopleList() {
  const s = useStrings();
  const topic = useUsersTopic();
  const access = useContext(PeopleContext);
  const savedView = access.listView;
  const bulkQuota = useBulkQuota();
  const connection = useConnectionState();
  const now = useNow();
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const phoneListLayout = usePhoneListLayout();
  const [search, setSearch] = useState(savedView.search);
  const delayedSearch = useDebouncedValue(search);
  const debouncedSearch = search.trim() === "" ? "" : delayedSearch;
  const [filter, setFilter] = useState<UserFilter>(savedView.filter);
  const [sort, setSort] = useState(() => getStoredUserSort());
  const [actionUser, setActionUser] = useState<UsersTopicUser | null>(null);
  const [actionIntent,setActionIntent] = useState<ActionSheetIntent>("menu");
  const [actionAnchor,setActionAnchor]=useState<DOMRect|undefined>();
  const [swiped, setSwiped] = useState<{username:string;side:SwipeSide}|null>(null);
  const [sortSheetOpen, setSortSheetOpen] = useState(false);
  const [gestureHintVisible, setGestureHintVisible] = useState(true);
  const activePreset = sortPresetOf(sort);
  const sortAscending = sort.direction === "asc";
  const sortChipLabel = sortLabelFor(s, activePreset, true, sortAscending);

  function updateSort(next: typeof sort) {
    setSort(next);
    setStoredUserSort(next);
  }

  const webUsernames = useMemo(() => new Set(access.profiles.keys()), [access.profiles]);
  const filterOrder = access.profiles.size ? [...FILTER_ORDER, "web" as const] : FILTER_ORDER;
  const entries = useMemo<UserFilterInput<UsersTopicUser>[]>(
    () => topic.users.map((user) => ({
      user,
      status: computeUserStatus(user, getUserQuota(user, findQuotaEntry(topic.quota, user.username)), now),
      webAccess: webUsernames.has(user.username),
    })),
    [topic.users, topic.quota, now, webUsernames],
  );
  const counts = useMemo(() => countUserFilters(entries), [entries]);
  const visibleUsers = useMemo(() => {
    const kept = entries.filter((entry) => matchesUserFilter(entry, filter)).map((entry) => entry.user);
    return sortUsers(filterUsersByQuery(kept, debouncedSearch), sort);
  }, [entries, filter, debouncedSearch, sort]);
  const isNarrowed = debouncedSearch.trim().length > 0 || filter !== "all";
  // TanStack Virtual exposes an imperative object by design; React Compiler
  // must leave this component un-memoized rather than freeze its measurements.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: visibleUsers.length,
    getScrollElement: () => scrollRef.current,
    // The phone card has two metric rows; desktop/tablet keep one compact
    // table row. Matching the first estimate to the CSS layout prevents the
    // virtualizer from shifting the saved position while those rows measure.
    estimateSize: () => 84,
    overscan: 6,
    initialOffset: savedView.scrollOffset,
    getItemKey: (index) => visibleUsers[index]?.username ?? index,
  });
  useEffect(()=>{setSwiped(null);},[phoneListLayout]);
  useEffect(()=>{if(!swiped)return;const close=(event:KeyboardEvent)=>{if(event.key!=="Escape"||document.querySelector('[role="dialog"]'))return;setSwiped(null);const row=[...(scrollRef.current?.querySelectorAll<HTMLElement>('[data-user]')??[])].find(row=>row.dataset["user"]===swiped.username);row?.querySelector<HTMLButtonElement>('button.user-identity')?.focus();};document.addEventListener("keydown",close);return()=>document.removeEventListener("keydown",close);},[swiped]);

  useEffect(() => {
    const username = savedView.returnUsername;
    if (!username || topic.isPending || visibleUsers.length === 0) return;
    const index = visibleUsers.findIndex((user) => user.username === username);
    savedView.returnUsername = null;
    if (index < 0) return;

    // After a mobile detail route unmounts the list, return to the person the
    // operator opened. Anchoring to identity is stable even when live activity
    // changes the sort order while the detail screen is open.
    const frame = window.requestAnimationFrame(() => {
      virtualizer.scrollToIndex(index, { align: "center" });
      savedView.scrollOffset = scrollRef.current?.scrollTop ?? savedView.scrollOffset;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [topic.isPending, visibleUsers, virtualizer, savedView]);

  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  function setSearchValue(value: string) {
    setSwiped(null);
    savedView.search = value;
    savedView.returnUsername = null;
    savedView.scrollOffset = 0;
    setSearch(value);
    virtualizer.scrollToOffset(0);
  }

  function setFilterValue(value: UserFilter) {
    setSwiped(null);
    savedView.filter = value;
    savedView.scrollOffset = 0;
    setFilter(value);
    virtualizer.scrollToOffset(0);
  }

  function openPerson(user: UsersTopicUser) {
    setSwiped(null);
    savedView.scrollOffset = scrollRef.current?.scrollTop ?? 0;
    savedView.returnUsername = user.username;
    navigate({ to: "/people/$username", params: { username: user.username } });
  }

  function openActions(user:UsersTopicUser,intent:ActionSheetIntent="menu",anchor?:DOMRect) {
    setSwiped(null);setActionIntent(intent);setActionUser(user);setActionAnchor(anchor);
  }
  const create = ()=>void navigate({to:"/people",search:{create:true}});
  const edit = (user:UsersTopicUser)=>void navigate({to:"/people/$username",params:{username:user.username},search:{tab:"settings"}});

  return (
    <div className="users-workspace flex min-h-0 flex-1 flex-col p-4">
      <PageHeader title={s.people.title} titleMeta={<span className="font-mono text-meta tabular-nums text-text-muted">{counts.all}</span>} actions={
        <div className="flex shrink-0 gap-2"><Button aria-label={s.people.create} disabled={access.readOnly} onClick={create}><IconPlus className="h-4 w-4" /><span className="hidden min-[440px]:inline">{s.people.create}</span></Button><button type="button" className="user-menu-trigger" aria-label={s.people.bulkQuota.menu} onClick={e=>bulkQuota.openMenu(e.currentTarget.getBoundingClientRect())}><IconMore/></button></div>
      } />

      <div className="flex min-h-0 flex-1 gap-3">
        <section className="people-list-pane flex min-w-0 flex-1 flex-col">
          <div className="people-toolbar">
            <div className="people-search-control">
              <IconSearch className="h-4 w-4 shrink-0" />
              <input ref={searchRef} value={search} onChange={(event) => setSearchValue(event.target.value)} placeholder={s.people.searchPlaceholder} aria-label={s.people.searchPlaceholder} autoCapitalize="off" autoCorrect="off" />
              {search ? <button type="button" className="people-search-clear" aria-label={s.people.clearSearch} onClick={()=>{setSearchValue("");searchRef.current?.focus();}}><IconClose className="h-4 w-4"/></button> : <kbd>⌘ K</kbd>}
            </div>
            <div className="people-filter-group no-scrollbar" role="tablist" aria-label={s.people.filterLabel}>
              {filterOrder.map((key) => <button key={key} type="button" role="tab" className="people-filter-button" aria-selected={filter === key} onClick={() => setFilterValue(key)}>{s.people.filter[key]}<b>{counts[key]}</b></button>)}
            </div>
            <button type="button" className="people-sort-button" aria-label={sortChipLabel} onClick={() => setSortSheetOpen(true)}><IconSort className="h-4 w-4" /><span>{s.people.sortPreset[activePreset]}</span><SortArrow ascending={sortAscending} /></button>
          </div>

          {gestureHintVisible && phoneListLayout && <div className="user-gesture-hint"><p>{s.people.workspace.swipeHint}</p><button type="button" aria-label={s.common.close} onClick={() => setGestureHintVisible(false)}>×</button></div>}

          <div className="user-table-head" aria-hidden="true"><span>{s.people.tableUser}</span><span>{s.people.connections} / IP</span><span>{s.people.workspace.totalTraffic} / {s.people.form.quota}</span><span>{s.people.form.expiry}</span><span>{s.people.actions.menu}</span></div>

          <div ref={scrollRef} className="people-list-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain" onScroll={(event) => { savedView.scrollOffset = event.currentTarget.scrollTop; }}>
            <AsyncState
              isPending={topic.isPending}
              isError={topic.isError}
              errorCode={topic.errorCode ?? undefined}
              data={visibleUsers}
              isEmpty={(data) => data.length === 0}
              emptyTitle={isNarrowed ? s.common.empty : s.people.emptyTitle}
              emptyDescription={isNarrowed ? undefined : s.people.emptyDescription}
              emptyAction={isNarrowed ? undefined : <Button disabled={access.readOnly} onClick={create}>{s.people.create}</Button>}
              stale={topic.stale || connection.stale}
              onRetry={connection.retry}
              skeleton={<PeopleListSkeleton />}
            >
              {(users) => (
                <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
                  {virtualizer.getVirtualItems().map((item) => {
                    const user = users[item.index];
                    if (!user) return null;
                    return (
                      <div key={item.key} ref={virtualizer.measureElement} data-index={item.index} className="absolute left-0 top-0 w-full" style={{ transform: `translateY(${item.start}px)` }}>
                        <UserCard
                          user={user}
                          quotaEntry={findQuotaEntry(topic.quota, user.username)}
                          now={now}
                          gesturesEnabled={phoneListLayout}
                          swipeSide={swiped?.username===user.username?swiped.side:null}
                          canResetQuota={access.canResetQuota&&!topic.stale&&!bulkQuota.running}
                          canToggle={access.canToggle&&!topic.stale}
                          onOpen={() => openPerson(user)}
                          onActions={anchor => openActions(user,"menu",anchor)}
                          onResetQuota={()=>openActions(user,"reset-quota")}
                          onToggle={()=>openActions(user,"toggle-enabled")}
                          onSwipeChange={side=>setSwiped(prev=>side?{username:user.username,side}:prev?.username===user.username?null:prev)}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </AsyncState>
          </div>

          <footer className="flex min-h-14 shrink-0 items-center border-t border-border px-4 text-micro text-text-faint">
            <span>{isNarrowed ? `${visibleUsers.length} / ${counts.all}` : pluralTemplate(s, counts.all, s.people.recordsCount)}<span className="hidden sm:inline"> · {s.people.searchWholeSet}</span></span>
          </footer>
        </section>

      </div>

      <UserActionSheet key={`${actionUser?.username}:${actionIntent}`} open={actionUser !== null} user={actionUser} anchor={actionAnchor} intent={actionIntent} readOnly={access.readOnly||topic.stale} onClose={() => setActionUser(null)} onEdit={edit} onOpenPerson={openPerson} onOpenAccess={user=>void navigate({to:"/people/$username",params:{username:user.username},search:{tab:"access"}})} />
      <Sheet open={sortSheetOpen} onClose={() => setSortSheetOpen(false)} title={s.people.sortLabel}>
        <CardList>
          {SORT_PRESET_ORDER.map((preset) => {
            const active = activePreset === preset;
            const ascending = active && sortAscending;
            return <CardRow key={preset}><button type="button" className="flex min-h-[44px] flex-1 items-center gap-2 text-left text-row text-text" aria-label={sortLabelFor(s, preset, active, ascending)} onClick={() => { updateSort(nextSortState(sort, preset)); setSortSheetOpen(false); }}><span className="flex-1">{s.people.sortPreset[preset]}</span>{active && <span className="flex items-center gap-1 text-meta text-text-muted">{ascending ? s.people.sortAscending : s.people.sortDescending}<SortArrow ascending={ascending} /></span>}</button></CardRow>;
          })}
        </CardList>
      </Sheet>
    </div>
  );
}

function subscribePhoneListLayout(callback: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const media = window.matchMedia(PHONE_LIST_QUERY);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

function getPhoneListLayout(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(PHONE_LIST_QUERY).matches;
}

function usePhoneListLayout(): boolean {
  return useSyncExternalStore(subscribePhoneListLayout, getPhoneListLayout, () => false);
}

function sortLabelFor(s: Dict, preset: UserSortPreset, active: boolean, ascending: boolean): string {
  const direction = active ? `, ${ascending ? s.people.sortAscending : s.people.sortDescending}` : "";
  return `${s.people.sortLabel}: ${s.people.sortPreset[preset]}${direction}`;
}

function SortArrow({ ascending }: { ascending: boolean }) {
  return ascending ? <IconArrowUp className="h-3 w-3" /> : <IconArrowDown className="h-3 w-3" />;
}

function PeopleListSkeleton() {
  return <div className="flex flex-col">{[0, 1, 2, 3, 4].map((index) => <div key={index} className="flex min-h-[78px] items-center gap-3 border-b border-border px-4"><div className="h-10 w-10 shrink-0 animate-pulse rounded-xl bg-surface-2" /><div className="flex-1"><div className="h-3.5 w-28 animate-pulse rounded bg-surface-2" /><div className="mt-2 h-3 w-44 animate-pulse rounded bg-surface-2" /></div></div>)}</div>;
}
