import type { ReactNode } from "react";

type MenuCourse = {
  id: string;
  label: string;
  english: string;
  dishes: Array<{ name: string; description: string }>;
};

const courseDefaults = [
  { id: "starter", label: "开胃前菜", english: "APPETIZER" },
  { id: "main", label: "主厨热菜", english: "MAIN COURSE" },
  { id: "staple", label: "主食点心", english: "STAPLE" },
  { id: "soup", label: "汤饮甜品", english: "SOUP & DESSERT" },
];

export function ArchiveCardArc({ id }: { id: string }) {
  return <svg className="archive-card-arc" viewBox="0 0 460 140" role="img" aria-label="阿德小厨房">
    <defs><path id={id} d="M 18 122 Q 230 12 442 122" /></defs>
    {["阿", "德", "小", "厨", "房"].map((glyph, index) => <text key={glyph}><textPath href={`#${id}`} startOffset={`${8 + index * 21}%`} textAnchor="middle">{glyph}</textPath></text>)}
  </svg>;
}

export function ArchiveSideNotes() {
  return <>{["唤醒久困英雄", "指引迷途君子"].map((text, index) => <div key={text} className={`archive-card-side-note ${index === 0 ? "left" : "right"}`} aria-label={text}>{Array.from(text).map((glyph, i) => <span key={i}>{glyph}</span>)}</div>)}</>;
}

// Preview, exports and the guest's published menu use the same column structure.
export function MenuCardCourses({ template, courses, showDescriptions = true, emptyContent }: {
  template: string;
  courses: MenuCourse[];
  showDescriptions?: boolean;
  emptyContent?: ReactNode;
}) {
  const hasDishes = courses.some(course => course.dishes.length > 0);
  const renderCourse = (course: MenuCourse, includeEmpty = false) => {
    if (!course.dishes.length && !includeEmpty) return null;
    return <section key={course.id} data-course={course.id}>
      <h3><span>{course.label}</span><small>{course.english}</small></h3>
      <div>{course.dishes.map((dish, index) => <article key={`${course.id}-${index}`}><strong>{dish.name}</strong>{showDescriptions && <span>{dish.description}</span>}</article>)}</div>
    </section>;
  };
  const atlasCourse = (id: string): MenuCourse => courses.find(course => course.id === id) || { ...courseDefaults.find(course => course.id === id)!, dishes: [] };
  return <div className={`menu-card-courses${template === "ingredient-atlas" ? " ingredient-atlas-menu-courses" : ""}`}>
    {template === "ingredient-atlas" && hasDishes
      ? <div className="ingredient-atlas-columns"><div className="ingredient-atlas-left">{["starter", "staple", "soup"].map(id => renderCourse(atlasCourse(id), true))}</div>{renderCourse(atlasCourse("main"), true)}</div>
      : courses.map(course => renderCourse(course))}
    {!hasDishes && emptyContent}
  </div>;
}
