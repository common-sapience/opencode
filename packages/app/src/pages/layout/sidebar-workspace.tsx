import { A, useNavigate, useParams } from "@solidjs/router"
import { createEffect, createMemo, For, Show, type Accessor, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { createSortable } from "@thisbeyond/solid-dnd"
import { createMediaQuery } from "@solid-primitives/media"
import { base64Encode } from "@opencode-ai/core/util/encode"
import { getFilename } from "@opencode-ai/core/util/path"
import { Button } from "@opencode-ai/ui/button"
import { Collapsible } from "@opencode-ai/ui/collapsible"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { IconButtonV2 } from "@opencode-ai/ui/v2/icon-button-v2"
import { Icon as IconV2 } from "@opencode-ai/ui/v2/icon"
import { Spinner } from "@opencode-ai/ui/spinner"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { type Agent, type Session } from "@opencode-ai/sdk/v2/client"
import { type LocalProject } from "@/context/layout"
import { useServerSync, useQueryOptions } from "@/context/server-sync"
import { useServerSDK } from "@/context/server-sdk"
import { loadHomeSessionIndex, type HomeSessionEvents } from "@/context/global-sync/home-session-index"
import { useLanguage } from "@/context/language"
import { pathKey } from "@/utils/path-key"
import { NewSessionItem, SessionItem, SessionSkeleton } from "./sidebar-items"
import { sortedRootSessions } from "./helpers"
import { BLANK_AGENT, groupSessionsByAgent, sidebarAgents } from "./sidebar-agents"
import { useIsFetching, useQuery } from "@tanstack/solid-query"

type InlineEditorComponent = (props: {
  id: string
  value: Accessor<string>
  onSave: (next: string) => void
  class?: string
  displayClass?: string
  editing?: boolean
  stopPropagation?: boolean
  openOnDblClick?: boolean
}) => JSX.Element

export type WorkspaceSidebarContext = {
  currentDir: Accessor<string>
  navList: Accessor<Session[]>
  sidebarExpanded: Accessor<boolean>
  sidebarHovering: Accessor<boolean>
  clearHoverProjectSoon: () => void
  prefetchSession: (session: Session, priority?: "high" | "low") => void
  archiveSession: (session: Session) => Promise<void>
  unarchiveSession: (session: Session) => Promise<void>
  workspaceName: (directory: string, projectId?: string, branch?: string) => string | undefined
  renameWorkspace: (directory: string, next: string, projectId?: string, branch?: string) => void
  editorOpen: (id: string) => boolean
  openEditor: (id: string, value: string) => void
  closeEditor: () => void
  setEditor: (key: "value", value: string) => void
  InlineEditor: InlineEditorComponent
  isBusy: (directory: string) => boolean
  workspaceExpanded: (directory: string, local: boolean) => boolean
  setWorkspaceExpanded: (directory: string, value: boolean) => void
  showResetWorkspaceDialog: (root: string, directory: string) => void
  showDeleteWorkspaceDialog: (root: string, directory: string) => void
  setScrollContainerRef: (el: HTMLDivElement | undefined, mobile?: boolean) => void
}

export const WorkspaceDragOverlay = (props: {
  sidebarProject: Accessor<LocalProject | undefined>
  activeWorkspace: Accessor<string | undefined>
  workspaceLabel: (directory: string, branch?: string, projectId?: string) => string
}): JSX.Element => {
  const serverSync = useServerSync()
  const language = useLanguage()
  const label = createMemo(() => {
    const project = props.sidebarProject()
    if (!project) return
    const directory = props.activeWorkspace()
    if (!directory) return

    const [workspaceStore] = serverSync().child(directory, { bootstrap: false })
    const kind =
      directory === project.worktree ? language.t("workspace.type.local") : language.t("workspace.type.sandbox")
    const name = props.workspaceLabel(directory, workspaceStore.vcs?.branch, project.id)
    return `${kind} : ${name}`
  })

  return (
    <Show when={label()}>
      {(value) => <div class="bg-background-base rounded-md px-2 py-1 text-14-medium text-text-strong">{value()}</div>}
    </Show>
  )
}

const WorkspaceHeader = (props: {
  local: Accessor<boolean>
  busy: Accessor<boolean>
  open: Accessor<boolean>
  directory: string
  language: ReturnType<typeof useLanguage>
  branch: Accessor<string | undefined>
  workspaceValue: Accessor<string>
  workspaceEditActive: Accessor<boolean>
  InlineEditor: WorkspaceSidebarContext["InlineEditor"]
  renameWorkspace: WorkspaceSidebarContext["renameWorkspace"]
  setEditor: WorkspaceSidebarContext["setEditor"]
  projectId?: string
}): JSX.Element => (
  <div class="flex items-center gap-1 min-w-0 flex-1">
    <div class="flex items-center justify-center shrink-0 size-6">
      <Show when={props.busy()} fallback={<Icon name="branch" size="small" />}>
        <Spinner class="size-[15px]" />
      </Show>
    </div>
    <span class="text-14-medium text-text-base shrink-0">
      {props.local() ? props.language.t("workspace.type.local") : props.language.t("workspace.type.sandbox")} :
    </span>
    <Show
      when={!props.local()}
      fallback={
        <span class="text-14-medium text-text-base min-w-0 truncate">
          {props.branch() ?? getFilename(props.directory)}
        </span>
      }
    >
      <props.InlineEditor
        id={`workspace:${props.directory}`}
        value={props.workspaceValue}
        onSave={(next) => {
          const trimmed = next.trim()
          if (!trimmed) return
          props.renameWorkspace(props.directory, trimmed, props.projectId, props.branch())
          props.setEditor("value", props.workspaceValue())
        }}
        class="text-14-medium text-text-base min-w-0 truncate"
        displayClass="text-14-medium text-text-base min-w-0 truncate"
        editing={props.workspaceEditActive()}
        stopPropagation={false}
        openOnDblClick={false}
      />
    </Show>
    <div class="flex items-center justify-center shrink-0 overflow-hidden w-0 opacity-0 transition-all duration-200 group-hover/workspace:w-3.5 group-hover/workspace:opacity-100 group-focus-within/workspace:w-3.5 group-focus-within/workspace:opacity-100">
      <Icon name={props.open() ? "chevron-down" : "chevron-right"} size="small" class="text-icon-base" />
    </div>
  </div>
)

const WorkspaceActions = (props: {
  directory: string
  local: Accessor<boolean>
  busy: Accessor<boolean>
  menuOpen: Accessor<boolean>
  pendingRename: Accessor<boolean>
  setMenuOpen: (open: boolean) => void
  setPendingRename: (value: boolean) => void
  sidebarHovering: Accessor<boolean>
  touch: Accessor<boolean>
  language: ReturnType<typeof useLanguage>
  workspaceValue: Accessor<string>
  openEditor: WorkspaceSidebarContext["openEditor"]
  showResetWorkspaceDialog: WorkspaceSidebarContext["showResetWorkspaceDialog"]
  showDeleteWorkspaceDialog: WorkspaceSidebarContext["showDeleteWorkspaceDialog"]
  root: string
  clearHoverProjectSoon: WorkspaceSidebarContext["clearHoverProjectSoon"]
  navigateToNewSession: () => void
}): JSX.Element => (
  <div
    class="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 transition-opacity"
    classList={{
      "opacity-100 pointer-events-auto": props.menuOpen(),
      "opacity-0 pointer-events-none": !props.menuOpen(),
      "group-hover/workspace:opacity-100 group-hover/workspace:pointer-events-auto": true,
      "group-focus-within/workspace:opacity-100 group-focus-within/workspace:pointer-events-auto": true,
    }}
  >
    <DropdownMenu
      modal={!props.sidebarHovering()}
      open={props.menuOpen()}
      onOpenChange={(open) => props.setMenuOpen(open)}
    >
      <Tooltip value={props.language.t("common.moreOptions")} placement="top">
        <DropdownMenu.Trigger
          as={IconButton}
          icon="dot-grid"
          variant="ghost"
          class="size-6 rounded-md"
          data-action="workspace-menu"
          data-workspace={base64Encode(props.directory)}
          aria-label={props.language.t("common.moreOptions")}
        />
      </Tooltip>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          onCloseAutoFocus={(event) => {
            if (!props.pendingRename()) return
            event.preventDefault()
            props.setPendingRename(false)
            props.openEditor(`workspace:${props.directory}`, props.workspaceValue())
          }}
        >
          <DropdownMenu.Item
            disabled={props.local()}
            onSelect={() => {
              props.setPendingRename(true)
              props.setMenuOpen(false)
            }}
          >
            <DropdownMenu.ItemLabel>{props.language.t("common.rename")}</DropdownMenu.ItemLabel>
          </DropdownMenu.Item>
          <DropdownMenu.Item
            disabled={props.local() || props.busy()}
            onSelect={() => props.showResetWorkspaceDialog(props.root, props.directory)}
          >
            <DropdownMenu.ItemLabel>{props.language.t("common.reset")}</DropdownMenu.ItemLabel>
          </DropdownMenu.Item>
          <DropdownMenu.Item
            disabled={props.local() || props.busy()}
            onSelect={() => props.showDeleteWorkspaceDialog(props.root, props.directory)}
          >
            <DropdownMenu.ItemLabel>{props.language.t("common.delete")}</DropdownMenu.ItemLabel>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu>
    <Show when={!props.touch()}>
      <Tooltip value={props.language.t("command.session.new")} placement="top">
        <IconButtonV2
          icon={<IconV2 name="edit" size="small" />}
          variant="ghost"
          size="small"
          class="size-6 rounded-md opacity-0 pointer-events-none group-hover/workspace:opacity-100 group-hover/workspace:pointer-events-auto group-focus-within/workspace:opacity-100 group-focus-within/workspace:pointer-events-auto"
          data-action="workspace-new-session"
          data-workspace={base64Encode(props.directory)}
          aria-label={props.language.t("command.session.new")}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            props.clearHoverProjectSoon()
            props.navigateToNewSession()
          }}
        />
      </Tooltip>
    </Show>
  </div>
)

const WorkspaceSessionList = (props: {
  slug: Accessor<string>
  mobile?: boolean
  ctx: WorkspaceSidebarContext
  showNew: Accessor<boolean>
  loading: Accessor<boolean>
  sessions: Accessor<Session[]>
  hasMore: Accessor<boolean>
  loadMore: () => Promise<void>
  language: ReturnType<typeof useLanguage>
}): JSX.Element => (
  <nav class="flex flex-col gap-1">
    <Show when={props.showNew()}>
      <NewSessionItem
        slug={props.slug()}
        mobile={props.mobile}
        sidebarExpanded={props.ctx.sidebarExpanded}
        clearHoverProjectSoon={props.ctx.clearHoverProjectSoon}
      />
    </Show>
    <Show when={props.loading()}>
      <SessionSkeleton />
    </Show>
    <For each={props.sessions()}>
      {(session) => (
        <SessionItem
          session={session}
          list={props.sessions()}
          navList={props.ctx.navList}
          slug={props.slug()}
          mobile={props.mobile}
          showChild
          sidebarExpanded={props.ctx.sidebarExpanded}
          clearHoverProjectSoon={props.ctx.clearHoverProjectSoon}
          prefetchSession={props.ctx.prefetchSession}
          archiveSession={props.ctx.archiveSession}
        />
      )}
    </For>
    <Show when={props.hasMore()}>
      <div class="relative w-full py-1">
        <Button
          variant="ghost"
          class="flex w-full text-left justify-start text-14-regular text-text-weak pl-2 pr-10"
          size="large"
          onClick={(e: MouseEvent) => {
            void props.loadMore()
            ;(e.currentTarget as HTMLButtonElement).blur()
          }}
        >
          {props.language.t("common.loadMore")}
        </Button>
      </div>
    </Show>
  </nav>
)

export const SortableWorkspace = (props: {
  ctx: WorkspaceSidebarContext
  directory: string
  project: LocalProject
  sortNow: Accessor<number>
  mobile?: boolean
}): JSX.Element => {
  const navigate = useNavigate()
  const params = useParams()
  const serverSync = useServerSync()
  const queryOptions = useQueryOptions()
  const language = useLanguage()
  const sortable = createSortable(props.directory)
  const [workspaceStore, setWorkspaceStore] = serverSync().child(props.directory, { bootstrap: false })
  const [menu, setMenu] = createStore({
    open: false,
    pendingRename: false,
  })
  const slug = createMemo(() => base64Encode(props.directory))
  const sessions = createMemo(() => sortedRootSessions(workspaceStore, props.sortNow()))
  const local = createMemo(() => props.directory === props.project.worktree)
  const active = createMemo(() => pathKey(props.ctx.currentDir()) === pathKey(props.directory))
  const workspaceValue = createMemo(() => {
    const branch = workspaceStore.vcs?.branch
    const name = branch ?? getFilename(props.directory)
    return props.ctx.workspaceName(props.directory, props.project.id, branch) ?? name
  })
  const open = createMemo(() => props.ctx.workspaceExpanded(props.directory, local()))
  const boot = createMemo(() => open() || active())
  const count = createMemo(() => sessions()?.length ?? 0)
  const hasMore = createMemo(() => workspaceStore.sessionTotal > count())
  const fetching = useIsFetching(() => queryOptions().sessions(pathKey(props.directory)))
  const busy = createMemo(() => props.ctx.isBusy(props.directory))
  const loading = () => fetching() > 0 && count() === 0
  const touch = createMediaQuery("(hover: none)")
  const showNew = createMemo(() => !loading() && (touch() || count() === 0 || (active() && !params.id)))
  const loadMore = async () => {
    setWorkspaceStore("limit", (limit) => (limit ?? 0) + 5)
    await serverSync().project.loadSessions(props.directory)
  }

  const workspaceEditActive = createMemo(() => props.ctx.editorOpen(`workspace:${props.directory}`))
  const header = () => (
    <WorkspaceHeader
      local={local}
      busy={busy}
      open={open}
      directory={props.directory}
      language={language}
      branch={() => workspaceStore.vcs?.branch}
      workspaceValue={workspaceValue}
      workspaceEditActive={workspaceEditActive}
      InlineEditor={props.ctx.InlineEditor}
      renameWorkspace={props.ctx.renameWorkspace}
      setEditor={props.ctx.setEditor}
      projectId={props.project.id}
    />
  )

  const openWrapper = (value: boolean) => {
    props.ctx.setWorkspaceExpanded(props.directory, value)
    if (value) return
    if (props.ctx.editorOpen(`workspace:${props.directory}`)) props.ctx.closeEditor()
  }

  createEffect(() => {
    if (!boot()) return
    serverSync().child(props.directory, { bootstrap: true })
  })

  return (
    <div
      // @ts-ignore
      use:sortable
      classList={{
        "opacity-30": sortable.isActiveDraggable,
        "opacity-50 pointer-events-none": busy(),
      }}
    >
      <Collapsible variant="ghost" open={open()} class="shrink-0" onOpenChange={openWrapper}>
        <div class="py-1">
          <div
            class="group/workspace relative"
            data-component="workspace-item"
            data-workspace={base64Encode(props.directory)}
          >
            <div class="flex items-center gap-1">
              <Show
                when={workspaceEditActive()}
                fallback={
                  <Collapsible.Trigger
                    class={`flex items-center justify-between w-full pl-2 py-1.5 rounded-md hover:bg-surface-raised-base-hover transition-[padding] duration-200 ${
                      menu.open ? "pr-16" : "pr-2"
                    } group-hover/workspace:pr-16 group-focus-within/workspace:pr-16`}
                    data-action="workspace-toggle"
                    data-workspace={base64Encode(props.directory)}
                  >
                    {header()}
                  </Collapsible.Trigger>
                }
              >
                <div
                  class={`flex items-center justify-between w-full pl-2 py-1.5 rounded-md transition-[padding] duration-200 ${
                    menu.open ? "pr-16" : "pr-2"
                  } group-hover/workspace:pr-16 group-focus-within/workspace:pr-16`}
                >
                  {header()}
                </div>
              </Show>
              <WorkspaceActions
                directory={props.directory}
                local={local}
                busy={busy}
                menuOpen={() => menu.open}
                pendingRename={() => menu.pendingRename}
                setMenuOpen={(open) => setMenu("open", open)}
                setPendingRename={(value) => setMenu("pendingRename", value)}
                sidebarHovering={props.ctx.sidebarHovering}
                touch={touch}
                language={language}
                workspaceValue={workspaceValue}
                openEditor={props.ctx.openEditor}
                showResetWorkspaceDialog={props.ctx.showResetWorkspaceDialog}
                showDeleteWorkspaceDialog={props.ctx.showDeleteWorkspaceDialog}
                root={props.project.worktree}
                clearHoverProjectSoon={props.ctx.clearHoverProjectSoon}
                navigateToNewSession={() => navigate(`/${slug()}/session`)}
              />
            </div>
          </div>
        </div>

        <Collapsible.Content>
          <WorkspaceSessionList
            slug={slug}
            mobile={props.mobile}
            ctx={props.ctx}
            showNew={showNew}
            loading={loading}
            sessions={sessions}
            hasMore={hasMore}
            loadMore={loadMore}
            language={language}
          />
        </Collapsible.Content>
      </Collapsible>
    </div>
  )
}

export const LocalWorkspace = (props: {
  ctx: WorkspaceSidebarContext
  project: LocalProject
  sortNow: Accessor<number>
  mobile?: boolean
}): JSX.Element => {
  const serverSync = useServerSync()
  const serverSDK = useServerSDK()
  const language = useLanguage()
  const workspace = createMemo(() => {
    const [store] = serverSync().child(props.project.worktree)
    return { store }
  })
  const slug = createMemo(() => base64Encode(props.project.worktree))
  // Sessions come from the server-wide index, not the one project's store: a session may run in
  // any directory, and a directory that is a repository is a project of its own (UI-08).
  const home = () => serverSync().homeSessions
  const eventLoad = useQuery(() => ({
    queryKey: home().eventsKey,
    queryFn: async (): Promise<HomeSessionEvents> => ({ sequence: 0, entries: [] }),
    initialData: { sequence: 0, entries: [] } satisfies HomeSessionEvents,
    enabled: false,
  }))
  const indexLoad = useQuery(() => ({
    queryKey: home().indexKey,
    queryFn: async ({ signal }) => {
      const cache = home()
      const eventSequence = cache.eventSequence()
      const index = await loadHomeSessionIndex(
        (input, options) => serverSDK().client.v2.session.list(input, options),
        eventSequence,
        signal,
      )
      cache.complete(eventSequence)
      return index
    },
    retry: false,
    staleTime: 30_000,
    refetchOnMount: true,
    refetchOnReconnect: true,
  }))
  const roots = createMemo(() =>
    home()
      .sessions(indexLoad.data, eventLoad.data)
      .filter((session) => !session.parentID)
      .sort((a, b) => (b.time.updated ?? b.time.created) - (a.time.updated ?? a.time.created)),
  )
  const sessions = createMemo(() => roots().filter((session) => session.time.archived === undefined))
  // The index only follows the events it is fed, so it is refetched after archiving.
  const archive = async (session: Session) => {
    await props.ctx.archiveSession(session)
    await indexLoad.refetch()
  }
  const loading = () => indexLoad.isLoading && sessions().length === 0

  return (
    <div
      ref={(el) => props.ctx.setScrollContainerRef(el, props.mobile)}
      class="size-full flex flex-col py-2 overflow-y-auto no-scrollbar [overflow-anchor:none]"
    >
      <AgentSessionList
        slug={slug}
        mobile={props.mobile}
        ctx={props.ctx}
        agents={() => workspace().store.agent ?? []}
        loading={loading}
        sessions={sessions}
        archive={archive}
        hasMore={() => false}
        loadMore={async () => {}}
        language={language}
      />
    </div>
  )
}

const COLLAPSED_KEY = "opencode.sidebar.agents.collapsed"

// Which agent groups the user folded, per browser; a missing or unreadable store means all open.
function readCollapsed(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : {}
    if (typeof parsed !== "object" || parsed === null) return {}
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => typeof value === "boolean")) as Record<
      string,
      boolean
    >
  } catch {
    return {}
  }
}

const AgentSessionList = (props: {
  slug: Accessor<string>
  mobile?: boolean
  ctx: WorkspaceSidebarContext
  agents: Accessor<Agent[]>
  loading: Accessor<boolean>
  sessions: Accessor<Session[]>
  archive: (session: Session) => Promise<void>
  hasMore: Accessor<boolean>
  loadMore: () => Promise<void>
  language: ReturnType<typeof useLanguage>
}): JSX.Element => {
  const agents = createMemo(() => sidebarAgents(props.agents(), props.sessions()))
  const grouped = createMemo(() => groupSessionsByAgent(agents(), props.sessions()))
  const label = (agent: { name: string }) => (agent.name === BLANK_AGENT ? props.language.t("sidebar.agents.blank") : agent.name)
  const [collapsed, setCollapsed] = createStore<Record<string, boolean>>(readCollapsed())
  const toggle = (name: string) => {
    setCollapsed(name, (value) => !value)
    try {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify(collapsed))
    } catch {}
  }
  return (
    <nav class="flex flex-col gap-3">
      <Show when={props.loading()}>
        <SessionSkeleton />
      </Show>
      <For each={agents()}>
        {(agent) => {
          const sessions = createMemo(() => grouped().get(agent.name) ?? [])
          const open = () => !collapsed[agent.name]
          const newHref = () => `/${props.slug()}/session?agent=${encodeURIComponent(agent.name)}`
          return (
            <div class="group/agent flex flex-col gap-1" data-component="sidebar-agent" data-agent={agent.name}>
              <div class="flex items-center gap-1 min-w-0 pr-1">
                <button
                  type="button"
                  class="flex items-center gap-1 min-w-0 flex-1 pl-1 py-0.5 rounded-md text-left hover:bg-surface-base-hover focus:outline-none"
                  data-action="agent-toggle"
                  data-agent={agent.name}
                  aria-expanded={open()}
                  onClick={() => toggle(agent.name)}
                >
                  <IconV2
                    name="chevron-down"
                    size="small"
                    class="text-icon-weak shrink-0 transition-transform duration-150"
                    classList={{ "rotate-180": open() }}
                  />
                  <Tooltip value={agent.description ?? label(agent)} placement="right" class="min-w-0 flex-1">
                    <span class="block text-12-medium text-text-weak uppercase tracking-wide truncate">
                      {label(agent)}
                    </span>
                  </Tooltip>
                </button>
                <Tooltip value={props.language.t("command.session.new")} placement="top">
                  <A
                    href={newHref()}
                    class="shrink-0 size-6 rounded-md flex items-center justify-center text-icon-weak hover:bg-surface-base-hover opacity-0 pointer-events-none group-hover/agent:opacity-100 group-hover/agent:pointer-events-auto group-focus-within/agent:opacity-100 group-focus-within/agent:pointer-events-auto"
                    data-action="agent-new-session"
                    data-agent={agent.name}
                    aria-label={props.language.t("command.session.new")}
                    onClick={() => props.ctx.clearHoverProjectSoon()}
                  >
                    <IconV2 name="edit" size="small" />
                  </A>
                </Tooltip>
              </div>
              <Show when={open()}>
                <Show
                  when={sessions().length > 0}
                  fallback={
                    <A
                      href={newHref()}
                      class="flex items-center gap-2 min-w-0 w-full text-left py-1 pl-2 text-14-regular text-text-weak focus:outline-none"
                      data-action="agent-new-session"
                      data-agent={agent.name}
                      onClick={() => props.ctx.clearHoverProjectSoon()}
                    >
                      {props.language.t("sidebar.agents.empty")}
                    </A>
                  }
                >
                  <For each={sessions()}>
                    {(session) => (
                      <SessionItem
                        session={session}
                        list={sessions()}
                        navList={props.ctx.navList}
                        slug={props.slug()}
                        mobile={props.mobile}
                        showChild
                        sidebarExpanded={props.ctx.sidebarExpanded}
                        clearHoverProjectSoon={props.ctx.clearHoverProjectSoon}
                        prefetchSession={props.ctx.prefetchSession}
                        archiveSession={props.archive}
                      />
                    )}
                  </For>
                </Show>
              </Show>
            </div>
          )
        }}
      </For>
      <Show when={props.hasMore()}>
        <div class="relative w-full py-1">
          <Button
            variant="ghost"
            class="flex w-full text-left justify-start text-14-regular text-text-weak pl-2 pr-10"
            size="large"
            onClick={(e: MouseEvent) => {
              void props.loadMore()
              ;(e.currentTarget as HTMLButtonElement).blur()
            }}
          >
            {props.language.t("common.loadMore")}
          </Button>
        </div>
      </Show>
    </nav>
  )
}
