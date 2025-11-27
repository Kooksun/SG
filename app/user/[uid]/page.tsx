import UserDashboard from "@/components/UserDashboard";

export async function generateStaticParams() {
    return [];
}

export default function UserPage({
    params,
}: {
    params: { uid: string };
}) {
    return <UserDashboard uid={params.uid} />;
}
