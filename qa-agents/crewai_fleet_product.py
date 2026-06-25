"""CrewAI demo runner for Fleet ERP product analysis.

This script is a direct, runnable version of the prompt provided in chat.
It reads secrets from the environment (or a local .env file) and runs the
Fleet-focused agent crew against the supplied project metadata.
"""

from __future__ import annotations

import os
import warnings

from dotenv import load_dotenv

warnings.filterwarnings("ignore")


def get_openai_api_key() -> str:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError(
            "OPENAI_API_KEY is missing. Set it in qa-agents/.env or the shell environment."
        )
    return api_key


def get_serper_api_key() -> str | None:
    return os.environ.get("SERPER_API_KEY")


def main() -> None:
    from crewai import Agent, Crew, Task
    from crewai_tools import ScrapeWebsiteTool, SerperDevTool

    load_dotenv()

    openai_api_key = get_openai_api_key()
    serper_api_key = get_serper_api_key()
    model_name = os.environ.get("OPENAI_MODEL_NAME") or os.environ.get("OPENAI_MODEL") or "gpt-4o-mini"

    os.environ["OPENAI_API_KEY"] = openai_api_key
    os.environ["OPENAI_MODEL_NAME"] = model_name
    os.environ["OPENAI_MODEL"] = model_name
    if serper_api_key:
        os.environ["SERPER_API_KEY"] = serper_api_key
        search_tool = SerperDevTool()
    else:
        search_tool = None
        print("WARNING: SERPER_API_KEY is missing; continuing without SerperDevTool.")
    scrape_tool = ScrapeWebsiteTool()

    ui_ux_designer = Agent(
        role="UI/UX Designer",
        goal=(
            "Improve the user experience, information architecture, "
            "screen flows and module structure of an existing Fleet ERP "
            "for German fleet companies with 15–50 vehicles."
        ),
        tools=[tool for tool in [search_tool, scrape_tool] if tool is not None],
        verbose=True,
        backstory=(
            "You are a senior UI/UX designer specialized in B2B SaaS, "
            "ERP systems and operational dashboards. "
            "You understand German fleet operations, document-heavy workflows, "
            "assignment planning, driver management, vehicle compliance, "
            "tachograph processes and role-based enterprise software. "
            "Your job is not to redesign everything from scratch, but to make "
            "the existing Fleet project more professional, usable and demo-ready."
        ),
    )

    ui_design_system_designer = Agent(
        role="UI Design System Designer",
        goal=(
            "Create a premium, consistent and scalable design system "
            "for the existing Fleet ERP product."
        ),
        tools=[tool for tool in [search_tool, scrape_tool] if tool is not None],
        verbose=True,
        backstory=(
            "You are a design system expert for premium legal-tech and German B2B SaaS products. "
            "You define colors, typography, spacing, components, tables, forms, drawers, "
            "calendar views, kanban views, KPI cards, badges, alerts and dashboard patterns. "
            "You focus on clarity, trust, compliance, professional appearance and long-term scalability."
        ),
    )

    website_designer = Agent(
        role="Website Designer",
        goal=(
            "Design a high-converting landing page and website structure "
            "for the Fleet ERP product targeting German fleet companies."
        ),
        tools=[tool for tool in [search_tool, scrape_tool] if tool is not None],
        verbose=True,
        backstory=(
            "You are a website designer specialized in premium B2B SaaS, legal-tech style websites "
            "and German market positioning. "
            "You know how to communicate value clearly: solving German paperwork problems, "
            "assignment planning, tachograph workflows, vehicle documents, driver documents, "
            "fuel analysis, telematics and operational control. "
            "Your work should help the product look trustworthy, serious and ready for demos."
        ),
    )

    software_engineer = Agent(
        role="Software Engineer",
        goal=(
            "Analyze the existing Fleet ERP project and propose professional software architecture, "
            "module improvements and implementation plans without unnecessarily changing the current tech stack."
        ),
        tools=[tool for tool in [search_tool, scrape_tool] if tool is not None],
        verbose=True,
        backstory=(
            "You are a senior full-stack software engineer experienced with SaaS ERP systems, "
            "fleet management platforms, role-based access control, document systems, "
            "PostgreSQL databases, APIs, frontend dashboards and operational workflows. "
            "You always respect the existing project structure, programming language, framework, "
            "naming conventions and architecture. "
            "You do not rewrite the project from scratch. "
            "You improve what already exists and give practical, implementable steps."
        ),
    )

    testing_engineer = Agent(
        role="Testing Engineer",
        goal=(
            "Create a professional QA and testing strategy for the existing Fleet ERP project "
            "using Playwright E2E tests, regression tests and security-focused scenarios."
        ),
        tools=[tool for tool in [search_tool, scrape_tool] if tool is not None],
        verbose=True,
        backstory=(
            "You are a senior QA engineer specialized in enterprise SaaS, ERP systems, "
            "role-based applications, data privacy, document security and Playwright automation. "
            "You focus on authentication, protected routes, role-based access control, "
            "driver document privacy, cross-tenant security, assignment creation, "
            "TÜV/SP expiry warnings, leave request flows and regression coverage."
        ),
    )

    ui_ux_task = Task(
        description=(
            "Analyze the existing Fleet ERP project for {target_market}. "
            "The product helps German fleet companies with {fleet_size} vehicles manage "
            "drivers, vehicles, documents, reminders, assignments, fuel analysis, "
            "driver scoring, GPS, telematics and tachograph-related workflows. "
            "Review the current module list: {modules}. "
            "Create a professional UI/UX improvement plan for the existing product. "
            "Focus on dashboard structure, navigation, role-based user flows, "
            "document-heavy workflows, assignment planning, tachograph workflows, "
            "fuel analysis, driver scoring and operational clarity. "
            "Do not design a new product from scratch. Improve the current project."
        ),
        expected_output=(
            "A detailed UI/UX report formatted as markdown. "
            "It should include user roles, navigation structure, screen-by-screen improvements, "
            "dashboard recommendations, workflow improvements, module priorities, "
            "UX risks and demo-readiness recommendations."
        ),
        human_input=True,
        output_file="ui_ux_report.md",
        agent=ui_ux_designer,
    )

    design_system_task = Task(
        description=(
            "Create a premium legal-tech style design system for the existing Fleet ERP project. "
            "The design should feel serious, calm, professional, trustworthy and suitable "
            "for German B2B customers. "
            "The system must support dashboards, driver tables, vehicle tables, document cards, "
            "calendar views, Einsatzplan, Urlaubsplaner, request workflows, fuel analysis, "
            "GPS/telematics pages, tachograph pages, accident reports, handover flows, "
            "global search and user management. "
            "Define colors, typography, spacing, component rules, layout rules, "
            "status colors, warning states, badges and data visualization patterns."
        ),
        expected_output=(
            "A markdown design system report including color palette, typography, spacing, "
            "component library, table patterns, dashboard card patterns, form patterns, "
            "calendar patterns, warning states, accessibility notes and premium legal-tech style guidelines."
        ),
        output_file="design_system_report.md",
        agent=ui_design_system_designer,
    )

    website_design_task = Task(
        description=(
            "Design the marketing website and landing page structure for the Fleet ERP product. "
            "The website should target German fleet companies with 15–50 vehicles. "
            "The main positioning is: solving German paperwork problems, assignment planning, "
            "tachograph management, driver/vehicle documents, reminders, compliance, "
            "fuel analysis, GPS, telematics and operational control. "
            "The website should feel like a premium legal-tech / B2B SaaS product. "
            "Create the homepage structure, section titles, CTA ideas, pricing section ideas, "
            "demo request flow, trust elements and German-first copy suggestions."
        ),
        expected_output=(
            "A complete website design report formatted as markdown. "
            "It should include homepage sections, landing page copy, CTA text, pricing page idea, "
            "demo request flow, visual direction, trust-building elements and conversion recommendations."
        ),
        human_input=True,
        output_file="website_design_report.md",
        agent=website_designer,
    )

    software_architecture_task = Task(
        description=(
            "Analyze the existing Fleet ERP project and propose a professional software architecture plan. "
            "Important rule: the project already exists, so do not change the tech stack unnecessarily. "
            "Use the same programming language, framework, folder structure and conventions "
            "that the existing project already uses. "
            "The system currently includes these modules: {modules}. "
            "Add professional architecture recommendations for fuel analysis, driver scoring, "
            "GPS tracking, telematics integration and tachograph workflows. "
            "Also consider RBAC, document privacy, cross-tenant security, reminders, "
            "assignment planning, Excel export, file upload, API structure and database models."
        ),
        expected_output=(
            "A software architecture report formatted as markdown. "
            "It should include module architecture, database model suggestions, API suggestions, "
            "frontend/backend responsibilities, RBAC rules, security risks, integration strategy, "
            "implementation roadmap and technical priorities."
        ),
        human_input=True,
        output_file="software_architecture.md",
        agent=software_engineer,
    )

    testing_task = Task(
        description=(
            "Create a professional QA and testing strategy for the existing Fleet ERP project. "
            "Focus on Playwright E2E tests and regression testing. "
            "The required test areas are: Auth and protected routes, role-based access control, "
            "driver document privacy, cross-tenant security, assignment creation, "
            "TÜV/SP expiry warnings, leave request flow and Playwright E2E tests. "
            "Also add testing recommendations for fuel analysis, driver scoring, GPS, telematics, "
            "tachograph workflows, vehicle handovers, accidents, reminders and global search."
        ),
        expected_output=(
            "A testing report formatted as markdown. "
            "It should include test strategy, Playwright test scenarios, regression checklist, "
            "security test cases, role-based test cases, critical bugs to prevent, "
            "test data requirements and CI/GitHub Actions recommendations."
        ),
        output_file="testing_report.md",
        agent=testing_engineer,
    )

    fleet_product_crew = Crew(
        agents=[
            ui_ux_designer,
            ui_design_system_designer,
            website_designer,
            software_engineer,
            testing_engineer,
        ],
        tasks=[
            ui_ux_task,
            design_system_task,
            website_design_task,
            software_architecture_task,
            testing_task,
        ],
        verbose=True,
        tracing=False,
    )

    fleet_project_details = {
        "project_name": "Fleet ERP",
        "target_market": "German small and medium fleet companies",
        "fleet_size": "15–50",
        "project_status": (
            "The project already exists. The goal is not to rebuild it from scratch, "
            "but to make it more professional, scalable, demo-ready and suitable for German fleet companies."
        ),
        "main_problem": (
            "German fleet companies struggle with paperwork, driver and vehicle documents, "
            "assignment planning, reminders, tachograph processes, compliance and operational visibility."
        ),
        "product_goal": (
            "German fleet companies with 15–50 vehicles can manage drivers, vehicles, documents, "
            "reminders, assignments, fuel analysis, driver scoring, GPS, telematics and tachograph workflows "
            "in one professional ERP system."
        ),
        "design_style": "Premium legal-tech, serious German B2B SaaS, calm, professional and trustworthy",
        "website_positioning": (
            "Solve German paperwork problems, improve assignment planning, manage tachograph workflows, "
            "and give fleet owners clear operational control."
        ),
        "technical_rule": (
            "The software engineer must respect the existing project. "
            "Use the same programming language, framework, architecture and coding conventions "
            "that are already used in the current project."
        ),
        "modules": [
            "Dashboard",
            "Drivers",
            "Vehicles",
            "Documents",
            "Reminders",
            "Einsatzplan",
            "Urlaubsplaner",
            "Companies",
            "Requests",
            "Vehicle handovers",
            "Accidents",
            "Global search",
            "User management",
            "Fuel analysis",
            "GPS",
            "Telematics",
            "Tachograph",
        ],
        "required_testing_areas": [
            "Auth / protected routes",
            "Role-based access control",
            "Driver document privacy",
            "Cross-tenant security",
            "Assignment creation",
            "TÜV/SP expiry warnings",
            "Leave request flow",
            "Playwright E2E tests",
        ],
        "output_files": [
            "ui_ux_report.md",
            "design_system_report.md",
            "website_design_report.md",
            "software_architecture.md",
            "testing_report.md",
        ],
    }

    result = fleet_product_crew.kickoff(inputs=fleet_project_details)
    print(result)


if __name__ == "__main__":
    main()