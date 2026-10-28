import SeatWiseApp from "../../components/SeatWiseApp.jsx";
export default async function Page({ params }) {
  const { slug = [] } = await params;
  return <SeatWiseApp initialPath={"/" + slug.join("/")} />;
}
