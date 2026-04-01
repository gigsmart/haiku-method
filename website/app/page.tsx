import { getAllBlogPosts } from "@/lib/blog"
import HomeContent from "./HomeContent"

export default function Home() {
	const posts = getAllBlogPosts().slice(0, 3)
	return (
		<HomeContent
			recentPosts={posts.map((p) => ({
				slug: p.slug,
				title: p.title,
				description: p.description,
				date: p.date,
			}))}
		/>
	)
}
