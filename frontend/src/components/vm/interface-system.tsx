"use client";

import { CalendarDays, ChevronRight, Hotel, LayoutDashboard, Menu, Plus, Search, Settings, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

type Status = "disponible" | "reservado" | "pagado" | "pendiente";

const statusLabel: Record<Status, string> = {
  disponible: "Disponible",
  reservado: "Reservado",
  pagado: "Pagado",
  pendiente: "Pendiente"
};

export function VmStatusBadge({ status }: { status: Status }) {
  return <Badge variant={status}>{statusLabel[status]}</Badge>;
}

export function GuestHeader() {
  return (
    <header className="flex min-h-16 items-center justify-between gap-3 rounded-2xl border border-border bg-white/90 px-4 shadow-vm-soft backdrop-blur md:px-6">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-vm-green font-display text-lg font-bold text-vm-gold">VM</span>
        <div>
          <strong className="font-display text-xl leading-none text-vm-forest">Vista Montaña</strong>
          <span className="block text-xs font-bold uppercase tracking-[0.18em] text-vm-gold">Apartasuites</span>
        </div>
      </div>
      <nav className="hidden items-center gap-2 md:flex">
        <Button variant="ghost">Habitaciones</Button>
        <Button variant="ghost">Eventos</Button>
        <Button variant="ghost">Contacto</Button>
        <Button>Reservar</Button>
      </nav>
      <Button variant="secondary" size="icon" className="md:hidden" aria-label="Abrir menu">
        <Menu className="h-5 w-5" />
      </Button>
    </header>
  );
}

export function AdminSidebar({ active = "dashboard" }: { active?: string }) {
  const items = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "reservas", label: "Reservas", icon: CalendarDays },
    { id: "habitaciones", label: "Habitaciones", icon: Hotel },
    { id: "huespedes", label: "Huespedes", icon: Users },
    { id: "ajustes", label: "Ajustes", icon: Settings }
  ];

  return (
    <aside className="grid gap-5 rounded-2xl border border-border bg-white/95 p-4 shadow-vm">
      <div className="rounded-2xl bg-vm-green p-4 text-white">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white font-display text-lg font-bold text-vm-green">VM</span>
        <strong className="mt-4 block font-display text-2xl">Vista Montaña</strong>
        <span className="text-xs font-bold uppercase tracking-[0.18em] text-vm-gold">Administracion</span>
      </div>
      <nav className="grid gap-1">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Button key={item.id} variant={active === item.id ? "secondary" : "ghost"} className="justify-start">
              <Icon className="h-4 w-4" />
              {item.label}
            </Button>
          );
        })}
      </nav>
    </aside>
  );
}

export function MetricPanel({ label, value, helper, tone = "green" }: { label: string; value: string; helper?: string; tone?: "green" | "gold" | "clay" | "sky" }) {
  const colors = {
    green: "from-vm-green to-vm-forest",
    gold: "from-vm-gold to-amber-500",
    clay: "from-[#B96745] to-[#ff765e]",
    sky: "from-[#2D84C8] to-cyan-500"
  };

  return (
    <Card className="overflow-hidden">
      <div className={cn("h-1.5 bg-gradient-to-r", colors[tone])} />
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
      {helper && <CardContent className="text-sm text-muted-foreground">{helper}</CardContent>}
    </Card>
  );
}

export function RoomCard({ name, price, status = "disponible", capacity = "2 pax" }: { name: string; price: string; status?: Status; capacity?: string }) {
  return (
    <Card className="overflow-hidden">
      <div className="h-28 bg-gradient-to-br from-vm-green via-vm-gold to-[#84cbd8]" />
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>{name}</CardTitle>
            <CardDescription>{capacity} · Jacuzzi · Vista natural</CardDescription>
          </div>
          <VmStatusBadge status={status} />
        </div>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-3">
        <strong className="text-lg text-vm-forest">{price}</strong>
        <Button variant="secondary" size="sm">
          Ver detalles <ChevronRight className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}

export function ReservationForm() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Formulario de reserva</CardTitle>
        <CardDescription>Fechas, huesped y canal de confirmacion.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="guest">Huesped</Label>
          <Input id="guest" placeholder="Nombre completo" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="phone">Telefono</Label>
          <Input id="phone" placeholder="+57 300 000 0000" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="checkin">Ingreso</Label>
          <Input id="checkin" type="date" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="checkout">Salida</Label>
          <Input id="checkout" type="date" />
        </div>
        <Button className="md:col-span-2">
          <Plus className="h-4 w-4" />
          Crear reserva
        </Button>
      </CardContent>
    </Card>
  );
}

export function AvailabilityCalendar() {
  const days = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Calendario de disponibilidad</CardTitle>
        <CardDescription>Estados visuales para habitaciones y bloqueos.</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-7 gap-2">
        {days.map((day, index) => (
          <div key={day} className="grid min-h-20 place-items-center rounded-xl border border-border bg-vm-warm p-2 text-center">
            <span className="text-xs font-bold text-muted-foreground">{day}</span>
            <VmStatusBadge status={index % 4 === 0 ? "reservado" : index % 3 === 0 ? "pendiente" : "disponible"} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function ReservationsTable() {
  const rows = [
    ["REM-1021", "Angela Suarya", "Suite 21", "$800.000", "pagado"],
    ["REM-1022", "Joana Doe", "Penthouse", "$2.300.000", "pendiente"],
    ["REM-1023", "Sylvia Doe", "Suite Jacuzzi", "$1.340.000", "reservado"]
  ] as const;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Remision</TableHead>
          <TableHead>Huesped</TableHead>
          <TableHead>Habitacion</TableHead>
          <TableHead>Total</TableHead>
          <TableHead>Estado</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row[0]}>
            <TableCell className="font-bold text-vm-forest">{row[0]}</TableCell>
            <TableCell>{row[1]}</TableCell>
            <TableCell>{row[2]}</TableCell>
            <TableCell>{row[3]}</TableCell>
            <TableCell><VmStatusBadge status={row[4]} /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function ReservationDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" />
          Nueva reserva
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Crear reserva</DialogTitle>
          <DialogDescription>Modal accesible con Radix UI para registrar o editar una reserva.</DialogDescription>
        </DialogHeader>
        <ReservationForm />
      </DialogContent>
    </Dialog>
  );
}

export function AdminDashboardPreview() {
  return (
    <section className="grid gap-4">
      <div className="flex flex-col justify-between gap-3 rounded-2xl bg-gradient-to-r from-[#ff765e] via-[#ffd47c] to-[#85cdda] p-5 text-white shadow-vm md:flex-row md:items-center">
        <div>
          <p className="font-bold text-white/80">Hola, Admin</p>
          <h2 className="font-display text-4xl">Vista Montaña</h2>
        </div>
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar reserva..." />
        </div>
        <ReservationDialog />
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <MetricPanel label="Reservas" value="982" helper="Ultimos 30 dias" tone="clay" />
        <MetricPanel label="Ingresos" value="$45M" helper="Canal directo" tone="gold" />
        <MetricPanel label="Pendientes" value="73" helper="Por confirmar" tone="sky" />
        <MetricPanel label="Disponibles" value="168" helper="Noches abiertas" />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <AvailabilityCalendar />
        <Card>
          <CardHeader>
            <CardTitle>Reservas recientes</CardTitle>
            <CardDescription>Tabla administrativa con estados.</CardDescription>
          </CardHeader>
          <CardContent>
            <ReservationsTable />
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <RoomCard name="Suite Vista" price="$480.000" />
        <RoomCard name="Penthouse Familiar" price="$1.200.000" status="reservado" capacity="8 pax" />
        <RoomCard name="Suite Jacuzzi" price="$620.000" status="pendiente" />
      </div>
    </section>
  );
}

export function VistaMontanaSystemPreview() {
  return (
    <div className="grid min-h-screen gap-4 bg-vm-cream p-4 lg:grid-cols-[260px_1fr]">
      <AdminSidebar />
      <main className="grid gap-4">
        <GuestHeader />
        <AdminDashboardPreview />
      </main>
    </div>
  );
}
