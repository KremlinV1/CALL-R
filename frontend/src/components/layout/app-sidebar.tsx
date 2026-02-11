"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
} from "@/components/ui/sidebar"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  LayoutDashboard,
  Bot,
  Megaphone,
  Users,
  BarChart3,
  Phone,
  Settings,
  LogOut,
  ChevronUp,
  Zap,
  PhoneCall,
  CreditCard,
  HelpCircle,
  RefreshCw,
} from "lucide-react"
import { useAuthStore } from "@/stores/auth-store"
import { toast } from "sonner"

const navSections = [
  {
    label: "BUILD",
    items: [
      { title: "Agents", href: "/agents", icon: Bot },
    ],
  },
  {
    label: "DEPLOY",
    items: [
      { title: "Phone Numbers", href: "/phone-numbers", icon: Phone },
      { title: "Phone Pools", href: "/phone-pools", icon: PhoneCall },
      { title: "Campaigns", href: "/campaigns", icon: Megaphone },
    ],
  },
  {
    label: "MONITOR",
    items: [
      { title: "Dashboard", href: "/", icon: LayoutDashboard },
      { title: "Call History", href: "/calls", icon: Phone },
      { title: "Analytics", href: "/analytics", icon: BarChart3 },
    ],
  },
  {
    label: "SYSTEM",
    items: [
      { title: "Contacts", href: "/contacts", icon: Users },
      { title: "Settings", href: "/settings", icon: Settings },
    ],
  },
]

export function AppSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout } = useAuthStore()

  const handleLogout = () => {
    logout()
    toast.success("Logged out successfully")
    router.push("/login")
  }

  const userInitials = user 
    ? `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase() 
    : 'JD'
  
  const userName = user 
    ? `${user.firstName} ${user.lastName}` 
    : 'John Doe'

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-border/40 px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
            <Zap className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="text-lg font-bold bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
            Pon E Line
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-2 py-2">
        {navSections.map((section) => (
          <SidebarGroup key={section.label} className="px-0 py-1">
            <SidebarGroupLabel className="px-2 text-[11px] font-semibold text-muted-foreground/70 tracking-wider">
              {section.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {section.items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === item.href}
                      tooltip={item.title}
                      className="h-9"
                    >
                      <Link href={item.href}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-border/40 p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton className="w-full h-10">
                  <Avatar className="h-6 w-6">
                    <AvatarImage src="/avatar.png" />
                    <AvatarFallback className="text-xs">{userInitials}</AvatarFallback>
                  </Avatar>
                  <span className="flex-1 text-left truncate text-sm">{userName}</span>
                  <ChevronUp className="h-4 w-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col">
                    <span>{userName}</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {user?.email || 'john@example.com'}
                    </span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/settings">
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  className="text-destructive cursor-pointer"
                  onClick={handleLogout}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
