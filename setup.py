#!/usr/bin/env python3
"""
Setup script for InfraWatch CLI
"""

from setuptools import setup, find_packages
from pathlib import Path

# Read README
readme_path = Path(__file__).parent / "README.md"
long_description = ""
if readme_path.exists():
    long_description = readme_path.read_text(encoding="utf-8")

setup(
    name="infrawatch",
    version="2.5.0",
    description="InfraWatch - Infrastructure Monitoring System with Docker support",
    long_description=long_description,
    long_description_content_type="text/markdown",
    author="InfraWatch Team",
    author_email="team@infrawatch.dev",
    url="https://github.com/yourorg/infrawatch",
    license="MIT",
    
    # Python version
    python_requires=">=3.8",
    
    # Entry point for CLI command
    entry_points={
        "console_scripts": [
            "infrawatch=infrawatch_cli:main",
        ],
    },
    
    # Packages
    packages=find_packages(),
    py_modules=["infrawatch_cli"],
    
    # Keywords
    keywords=[
        "monitoring",
        "docker",
        "infrastructure",
        "cli",
        "system-monitoring",
        "docker-monitoring",
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
