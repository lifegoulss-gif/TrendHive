"use client";

import { trpc } from "@/trpc/client";
import Link from "next/link";
import { useState } from "react";

const roleConfig: Record<
	string,
	{ label: string; className: string; ring: string }
> = {
	OWNER: { label: "Owner", className: "bg-zinc-950 text-white", ring: "ring-zinc-700" },
	MANAGER: { label: "Manager", className: "bg-indigo-50 text-indigo-700 border border-indigo-200", ring: "ring-indigo-300" },
	EMPLOYEE: { label: "Employee", className: "bg-zinc-100 text-zinc-600", ring: "ring-zinc-200" },
};

const avatarColors = [
	"from-indigo-400 to-indigo-600",
	"from-violet-400 to-violet-600",
	"from-sky-400 to-sky-600",
	"from-emerald-400 to-emerald-600",
	"from-rose-400 to-rose-600",
];

function joinedLabel(date: Date | string): string {
	const d = new Date(date);
	const diff = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
	if (diff === 0) return "Joined today";
	if (diff < 7) return `${diff}d ago`;
	if (diff < 30) return `${Math.floor(diff / 7)}w ago`;
	return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function expiresLabel(date: Date | string): string {
	const d = new Date(date);
	const diff = Math.floor((d.getTime() - Date.now()) / (1000 * 60 * 60));
	if (diff < 1) return "< 1h";
	if (diff < 24) return `${diff}h`;
	return `${Math.floor(diff / 24)}d`;
}

export default function TeamPage() {
	const [showInvite, setShowInvite] = useState(false);
	const [inviteEmail, setInviteEmail] = useState("");
	const [inviteRole, setInviteRole] = useState<"EMPLOYEE" | "MANAGER">("EMPLOYEE");
	const [inviteSent, setInviteSent] = useState<string | null>(null);

	const { data: members, isLoading, refetch } = trpc.org.listMembers.useQuery(undefined, { staleTime: 30_000 });
	const { data: me } = trpc.org.me.useQuery(undefined, { staleTime: 60_000 });
	const { data: pendingInvites, refetch: refetchInvites } = trpc.invite.listPending.useQuery(undefined, { staleTime: 20_000 });
	const { data: sessions } = trpc.session.list.useQuery(undefined, { staleTime: 10_000 });

	const removeMutation = trpc.org.removeMember.useMutation({ onSuccess: () => refetch() });
	const roleMutation = trpc.org.updateMemberRole.useMutation({ onSuccess: () => refetch() });
	const inviteMutation = trpc.invite.create.useMutation({
		onSuccess: (data) => {
			const baseUrl = window.location.origin;
			setInviteSent(`${baseUrl}/join/${data.token}`);
			refetchInvites();
		},
	});
	const revokeMutation = trpc.invite.revoke.useMutation({ onSuccess: () => refetchInvites() });

	const ownerCount = members?.filter((m) => m.role === "OWNER").length ?? 0;
	const managerCount = members?.filter((m) => m.role === "MANAGER").length ?? 0;
	const employeeCount = members?.filter((m) => m.role === "EMPLOYEE").length ?? 0;
	const connectedSessions = (sessions ?? []).filter((s) => s.status === "CONNECTED").length;
	const totalSessions = (sessions ?? []).length;

	function handleSendInvite() {
		if (!inviteEmail.trim()) return;
		inviteMutation.mutate({ email: inviteEmail.trim(), role: inviteRole });
	}

	function handleCloseModal() {
		setShowInvite(false);
		setInviteEmail("");
		setInviteRole("EMPLOYEE");
		setInviteSent(null);
		inviteMutation.reset();
	}

	return (
		<div className="p-8 max-w-4xl">
			<div className="mb-8 flex items-start justify-between">
				<div>
					<p className="text-xs font-medium text-zinc-400 uppercase tracking-widest mb-1">Team</p>
					<h1 className="text-2xl font-semibold text-zinc-950 tracking-tight">Members</h1>
					<p className="text-sm text-zinc-500 mt-1">Manage your organization members and permissions</p>
				</div>
				<div className="flex items-center gap-3">
					{!isLoading && members && members.length > 0 && (
						<div className="flex items-center gap-3 text-[12px] text-zinc-400">
							{ownerCount > 0 && <span><span className="font-semibold text-zinc-700">{ownerCount}</span> owner</span>}
							{managerCount > 0 && <span><span className="font-semibold text-zinc-700">{managerCount}</span> manager{managerCount !== 1 ? "s" : ""}</span>}
							{employeeCount > 0 && <span><span className="font-semibold text-zinc-700">{employeeCount}</span> employee{employeeCount !== 1 ? "s" : ""}</span>}
						</div>
					)}
					<button
						type="button"
						onClick={() => setShowInvite(true)}
						className="flex items-center gap-2 px-4 py-2.5 bg-zinc-950 text-white text-[13px] font-semibold rounded-xl hover:bg-zinc-800 transition-colors"
					>
						<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
						</svg>
						Invite
					</button>
				</div>
			</div>

			{members && members.length > 0 && (
				<div className="mb-5 flex items-center justify-between bg-zinc-50 border border-zinc-200 rounded-xl px-5 py-3.5">
					<div className="flex items-center gap-1.5">
						<span className={`w-2 h-2 rounded-full ${connectedSessions > 0 ? "bg-emerald-500 animate-pulse" : "bg-zinc-300"}`} />
						<p className="text-[13px] text-zinc-700">
							<span className="font-semibold">{connectedSessions}</span> of <span className="font-semibold">{members.length}</span> members have WhatsApp linked
							{totalSessions > connectedSessions && <span className="text-zinc-400 ml-1">({totalSessions - connectedSessions} offline)</span>}
						</p>
					</div>
					<Link href="/dashboard/sessions" className="text-[12px] font-semibold text-indigo-600 hover:text-indigo-800 transition-colors">Manage sessions →</Link>
				</div>
			)}

			<div className="bg-white border border-zinc-200 rounded-xl overflow-hidden mb-6">
				{isLoading ? (
					<div className="p-6 space-y-3">
						{[0, 1, 2].map((i) => (
							<div key={i} className="h-14 bg-zinc-100 rounded-lg animate-pulse" style={{ opacity: 1 - i * 0.3 }} />
						))}
					</div>
				) : !members?.length ? (
					<div className="py-20 text-center">
						<div className="w-12 h-12 bg-zinc-100 rounded-xl flex items-center justify-center mx-auto mb-3">
							<svg className="w-6 h-6 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
							</svg>
						</div>
						<p className="text-sm font-medium text-zinc-600">No members yet</p>
						<p className="text-xs text-zinc-400 mt-1">Invite your team to start collaborating</p>
					</div>
				) : (
					<>
						<table className="w-full">
							<thead>
								<tr className="border-b border-zinc-100">
									<th className="text-left text-[11px] font-semibold text-zinc-400 uppercase tracking-wider px-6 py-3.5">Member</th>
									<th className="text-left text-[11px] font-semibold text-zinc-400 uppercase tracking-wider px-6 py-3.5">Role</th>
									<th className="text-left text-[11px] font-semibold text-zinc-400 uppercase tracking-wider px-6 py-3.5">Joined</th>
									<th className="text-right text-[11px] font-semibold text-zinc-400 uppercase tracking-wider px-6 py-3.5">Actions</th>
								</tr>
							</thead>
							<tbody>
								{members.map((member, i) => {
									const cfg = roleConfig[member.role] ?? roleConfig.EMPLOYEE;
									const nameOrEmail = member.name ?? member.email ?? "";
									const initials = nameOrEmail.split(" ").filter(Boolean).map((n) => n[0]).join("").slice(0, 2).toUpperCase() || "??";
									const isMe = member.id === me?.id;

									return (
										<tr key={member.id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50 transition-colors">
											<td className="px-6 py-4">
												<div className="flex items-center gap-3">
													<div className={`w-9 h-9 rounded-full bg-gradient-to-br ${avatarColors[i % avatarColors.length]} flex items-center justify-center text-white text-[11px] font-bold shrink-0 ring-2 ring-offset-1 ${cfg.ring}`}>
														{initials}
													</div>
													<div>
														<div className="flex items-center gap-1.5">
															<p className="text-[13px] font-semibold text-zinc-900">{member.name ?? "—"}</p>
															{isMe && <span className="text-[10px] text-zinc-400 font-medium">(you)</span>}
														</div>
														<p className="text-[11px] text-zinc-400">{member.email}</p>
													</div>
												</div>
											</td>
											<td className="px-6 py-4">
												<span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${cfg.className}`}>{cfg.label}</span>
											</td>
											<td className="px-6 py-4">
												<span className="text-[13px] text-zinc-500">{joinedLabel(member.createdAt)}</span>
											</td>
											<td className="px-6 py-4">
												{member.role !== "OWNER" && !isMe ? (
													<div className="flex items-center justify-end gap-4">
														<button
															type="button"
															onClick={() => roleMutation.mutate({ userId: member.id, role: member.role === "MANAGER" ? "EMPLOYEE" : "MANAGER" })}
															disabled={roleMutation.isPending}
															className="text-[13px] text-indigo-600 hover:text-indigo-800 font-medium disabled:opacity-40 transition-colors"
														>
															{member.role === "MANAGER" ? "Demote" : "Promote"}
														</button>
														<button
															type="button"
															onClick={() => { if (confirm(`Remove ${member.name ?? member.email}?`)) removeMutation.mutate(member.id); }}
															disabled={removeMutation.isPending}
															className="text-[13px] text-red-500 hover:text-red-700 font-medium disabled:opacity-40 transition-colors"
														>
															Remove
														</button>
													</div>
												) : (
													<p className="text-[12px] text-zinc-300 text-right">—</p>
												)}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
						<div className="px-6 py-4 bg-zinc-50 border-t border-zinc-100 flex items-center gap-6">
							<p className="text-[11px] text-zinc-400 font-medium">Roles:</p>
							<div className="flex items-center gap-4">
								{[
									{ role: "OWNER", desc: "Full access, billing" },
									{ role: "MANAGER", desc: "Team management, all sessions" },
									{ role: "EMPLOYEE", desc: "Own tasks & messages only" },
								].map(({ role, desc }) => {
									const cfg = roleConfig[role];
									return (
										<div key={role} className="flex items-center gap-2">
											<span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.className}`}>{cfg.label}</span>
											<span className="text-[11px] text-zinc-400">{desc}</span>
										</div>
									);
								})}
							</div>
						</div>
					</>
				)}
			</div>

			{(pendingInvites?.length ?? 0) > 0 && (
				<div>
					<h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-3">Pending invites</h2>
					<div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
						<table className="w-full">
							<thead>
								<tr className="border-b border-zinc-100">
									<th className="text-left text-[11px] font-semibold text-zinc-400 uppercase tracking-wider px-6 py-3">Email</th>
									<th className="text-left text-[11px] font-semibold text-zinc-400 uppercase tracking-wider px-6 py-3">Role</th>
									<th className="text-left text-[11px] font-semibold text-zinc-400 uppercase tracking-wider px-6 py-3">Expires</th>
									<th className="text-right text-[11px] font-semibold text-zinc-400 uppercase tracking-wider px-6 py-3">Actions</th>
								</tr>
							</thead>
							<tbody>
								{pendingInvites?.map((invite) => (
									<tr key={invite.id} className="border-b border-zinc-100 last:border-0">
										<td className="px-6 py-3.5 text-[13px] text-zinc-700">{invite.email}</td>
										<td className="px-6 py-3.5">
											<span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${roleConfig[invite.role]?.className ?? ""}`}>
												{roleConfig[invite.role]?.label}
											</span>
										</td>
										<td className="px-6 py-3.5 text-[12px] text-zinc-400">in {expiresLabel(invite.expiresAt)}</td>
										<td className="px-6 py-3.5 text-right">
											<button
												type="button"
												onClick={() => revokeMutation.mutate(invite.id)}
												disabled={revokeMutation.isPending}
												className="text-[12px] text-red-400 hover:text-red-600 font-medium disabled:opacity-40"
											>
												Revoke
											</button>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			)}

			{showInvite && (
				<div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50" onClick={handleCloseModal}>
					<div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl border border-zinc-200" onClick={(e) => e.stopPropagation()}>
						{inviteSent ? (
							<>
								<div className="text-center mb-5">
									<div className="w-12 h-12 bg-emerald-50 border border-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
										<svg className="w-6 h-6 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
										</svg>
									</div>
									<h2 className="text-base font-semibold text-zinc-950">Invite sent!</h2>
									<p className="text-[13px] text-zinc-500 mt-0.5">Email sent to {inviteEmail}.</p>
								</div>
								<div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3 mb-5">
									<p className="text-[11px] text-zinc-400 font-medium mb-1.5">Share this link if email doesn't arrive</p>
									<p className="text-[11px] font-mono text-zinc-700 break-all select-all">{inviteSent}</p>
								</div>
								<button type="button" onClick={handleCloseModal} className="w-full py-2.5 text-[13px] font-semibold text-white bg-zinc-950 rounded-xl hover:bg-zinc-800 transition-colors">
									Done
								</button>
							</>
						) : (
							<>
								<div className="mb-5">
									<h2 className="text-base font-semibold text-zinc-950">Invite to workspace</h2>
									<p className="text-[13px] text-zinc-500 mt-0.5">They'll get a personal join link via email.</p>
								</div>
								<div className="space-y-3 mb-5">
									<div>
										<label className="text-[12px] font-medium text-zinc-500 block mb-1.5">Email address</label>
										<input
											type="email"
											placeholder="employee@company.com"
											value={inviteEmail}
											onChange={(e) => setInviteEmail(e.target.value)}
											onKeyDown={(e) => { if (e.key === "Enter") handleSendInvite(); }}
											className="w-full px-3 py-2.5 border border-zinc-200 rounded-xl text-[13px] text-zinc-900 placeholder-zinc-400 outline-none focus:border-zinc-400 transition-colors"
											autoFocus
										/>
									</div>
									<div>
										<label className="text-[12px] font-medium text-zinc-500 block mb-1.5">Role</label>
										<div className="grid grid-cols-2 gap-2">
											{(["EMPLOYEE", "MANAGER"] as const).map((r) => (
												<button
													key={r}
													type="button"
													onClick={() => setInviteRole(r)}
													className={`py-2.5 rounded-xl border text-[13px] font-medium transition-all ${inviteRole === r ? "bg-zinc-950 text-white border-zinc-950" : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300"}`}
												>
													{r === "EMPLOYEE" ? "Employee" : "Manager"}
												</button>
											))}
										</div>
										<p className="text-[11px] text-zinc-400 mt-1.5">
											{inviteRole === "EMPLOYEE" ? "Sees their own tasks and messages only." : "Can view all sessions and manage employees."}
										</p>
									</div>
								</div>
								{inviteMutation.isError && (
									<p className="text-[12px] text-red-500 mb-3">{inviteMutation.error.message}</p>
								)}
								<div className="flex gap-2.5">
									<button type="button" onClick={handleCloseModal} className="flex-1 py-2.5 text-[13px] font-medium text-zinc-600 bg-zinc-100 rounded-xl hover:bg-zinc-200 transition-colors">Cancel</button>
									<button
										type="button"
										onClick={handleSendInvite}
										disabled={inviteMutation.isPending || !inviteEmail.trim()}
										className="flex-1 py-2.5 text-[13px] font-semibold text-white bg-zinc-950 rounded-xl hover:bg-zinc-800 transition-colors disabled:opacity-50"
									>
										{inviteMutation.isPending ? "Sending…" : "Send invite"}
									</button>
								</div>
							</>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
