#!/usr/bin/env python3
"""
Setup script for Ahova CLI
"""

from setuptools import setup, find_packages
from pathlib import Path

# Read README
readme_path = Path(__file__).parent / "README.md"
long_description = ""
if readme_path.exists():
    long_description = readme_path.read_text(encoding="utf-8")

setup(
    name="ahova",
    version="2.5.0",
    description="Ahova - Infrastructure Observability Platform with Docker support",
    long_description=long_description,
    long_description_content_type="text/markdown",
    author="Ahova Team",
    author_email="team@ahova.dev",
    url="https://github.com/yourorg/ahova",
    license="MIT",
    
    # Python version
    python_requires=">=3.8",
    
    # Entry point for CLI command
    entry_points={
        "console_scripts": [
            "ahova=ahova_cli:main",
        ],
    },
    
    # Packages
    packages=find_packages(),
    py_modules=["ahova_cli"],
    
    # Keywords
    keywords=[
        "monitoring",
        "docker",
        "infrastructure",
        "cli",
        "system-monitoring",
        "docker-monitoring",
        "observability",
    ],
    
    # Classifiers
    classifiers=[
        "Development Status :: 4 - Beta",
        "Environment :: Console",
        "Intended Audience :: Developers",
        "Intended Audience :: System Administrators",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
        "Programming Language :: Python :: 3.13",
        "Topic :: System :: Monitoring",
        "Topic :: System :: Networking",
    ],
)
